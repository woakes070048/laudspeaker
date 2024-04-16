import { sleep, fail } from "k6";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";
import http from "k6/http";
import { Httpx } from "https://jslib.k6.io/httpx/0.1.0/index.js";
import { createAccount } from "./utils/accounts.js";
import { Counter } from "k6/metrics";
import { Reporter, HttpxWrapper, failOnError } from "./utils/common.js";

export const options = {
  scenarios: {
    upload_and_send: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: "2h",
    },
  },
};

// Preload CSV files
const csvData = {};
if (__ENV.CSV_FILES) {
  const csvFiles = JSON.parse(__ENV.CSV_FILES);
  const csvBasePath = __ENV.CSV_FILEPATH || fail("CSV_FILEPATH required");
  csvFiles.forEach((file) => {
    let filePath = csvBasePath + file;
    console.log("filepath is", filePath);
    csvData[file] = open(filePath, "b");
  });
}

const customersImported = new Counter("customers_imported");
const customersImportedTime = new Counter("customers_imported_time");
const customersMessaged = new Counter("customers_messaged");
const customersMessagedTime = new Counter("customers_messaged_time");

// Test config
const EMAIL =
  __ENV.EMAIL || `perf${String(Math.random()).substring(2, 7)}@test.com`;
//const UPLOAD_FILE = open(__ENV.CSV_FILEPATH, "b");
const POLLING_MINUTES = parseFloat(__ENV.POLLING_MINUTES) || 1;
let BASE_URL = __ENV.BASE_URL || fail("BASE_URL required");
const PRIMARY_KEY_HEADER = "user_id";
const source = "source";
const mkt_agree = "mkt_agree";
const credit_score = "credit_score";
const credit_score_date = "credit_score_date";
const NUM_CUSTOMERS = __ENV.NUM_CUSTOMERS || fail("NUM_CUSTOMERS required");
const UPLOAD_TIMEOUT = __ENV.UPLOAD_TIMEOUT || "600s";
if (BASE_URL.at(-1) === "/") {
  BASE_URL = BASE_URL.substring(0, BASE_URL.length - 1);
}

const session = new Httpx({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 300000, // 5 minute timeout.
});

export default function main() {
  let csvFiles = JSON.parse(__ENV.CSV_FILES || fail("CSV_FILES required"));
  let csvBasePath = __ENV.CSV_FILEPATH || fail("CSV_FILEPATH required");
  let response;
  let httpxWrapper = new HttpxWrapper(session);

  let devOrProdUrl = "";

  let reporter = new Reporter("SETUP");
  reporter.addTimer("totalElapsed", "Total elapsed time of k6 test");
  reporter.report(
    `Started script with email: ${EMAIL} and file ${__ENV.CSV_FILEPATH}. Testing ${NUM_CUSTOMERS} customers.`
  );

  reporter.setStep("CREATE_ACCOUNT");
  reporter.addTimer("createAccount", "Elapsed time of create account");
  reporter.log(`Creating account and organization`);

  // CREATE ACCOUNT and set Auth header
  let { authorization, email, password } = createAccount(EMAIL, httpxWrapper);
  console.log(authorization, email, password);

  reporter.report(`Finished creating account and organization.`);
  reporter.log(`Email: ${email}`);
  reporter.log(`Authorization header: ${authorization}`);
  reporter.removeTimer("createAccount");

  reporter.setStep("SET UP SCHEMA");

  // SET UP SCHEMA
  reporter.log(`Creating customer attributes`);
  /*
  response = httpxWrapper.postOrFail(
    "/api/customers/attributes/create",
    `{"name":"${PRIMARY_KEY_HEADER}","type":"String"}`
  );
  */
  response = httpxWrapper.postOrFail(
    "/customers/attributes/create",
    `{"name":"${PRIMARY_KEY_HEADER}","type":"String"}`,
    devOrProdUrl
  );
  response = httpxWrapper.postOrFail(
    "/customers/attributes/create",
    `{"name":"${source}","type":"String"}`,
    devOrProdUrl
  );

  response = httpxWrapper.postOrFail(
    "/customers/attributes/create",
    `{"name":"${mkt_agree}","type":"Boolean"}`,
    devOrProdUrl
  );

  response = httpxWrapper.postOrFail(
    "/customers/attributes/create",
    `{"name":"${credit_score}","type":"Number"}`,
    devOrProdUrl
  );

  response = httpxWrapper.postOrFail(
    "/customers/attributes/create",
    `{"name":"${credit_score_date}","type":"Date", "dateFormat": "yyyy-MM-dd"}`,
    devOrProdUrl
  );

  reporter.setStep("UPLOAD");

  Object.keys(csvData).forEach((fileKey) => {
    uploadForFile(
      csvData[fileKey],
      httpxWrapper,
      reporter,
      devOrProdUrl,
      authorization
    );
  });

  /*
  csvFiles.forEach(file => {
    let filePath = csvBasePath + file;
    let uploadFile = open(filePath, "b");
    uploadForFile(uploadFile, httpxWrapper, reporter, devOrProdUrl);
  });
  */
}

function uploadForFile(
  uploadFile,
  httpxWrapper,
  reporter,
  devOrProdUrl,
  authorization
) {
  let UPLOADED_FILE_KEY;

  reporter.log(`Uploading file and processing`);

  let response = http.post(
    `${BASE_URL}/customers/uploadCSV`,
    { file: http.file(uploadFile, "upload.csv", "text/csv") },
    {
      timeout: __ENV.UPLOAD_TIMEOUT || "600s",
      headers: {
        authorization,
      },
    }
  );

  failOnError(response);

  //response = httpxWrapper.getOrFail("/api/customers/getLastImportCSV");
  response = httpxWrapper.getOrFail(
    "/customers/getLastImportCSV",
    undefined,
    devOrProdUrl
  );

  UPLOADED_FILE_KEY = response.json("fileKey");
  reporter.report(`CSV upload finished with fileKey: ${UPLOADED_FILE_KEY}`);
  reporter.removeTimer("csvUpload");

  reporter.log(`New customers: ${NUM_CUSTOMERS}`);

  reporter.report(`Starting import for fileKey: ${UPLOADED_FILE_KEY}`);
  reporter.addTimer(
    "startImport",
    "Time elapsed of import process (not including csv upload)"
  );
  response = httpxWrapper.postOrFail(
    "/customers/attributes/start-import",
    `{
      "mapping": {
        "dsr": {
          "head": "dsr",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_apt": {
          "head": "is_apt",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "source": {
          "head": "source",
          "asAttribute": {
            "key": "source",
            "type": "String",
            "skip": false
          },
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "user_id": {
          "head": "user_id",
          "asAttribute": {
            "key": "user_id",
            "type": "String",
            "skip": false
          },
          "isPrimary": true,
          "doNotOverwrite": true
        },
        "is_delete": {
          "head": "is_delete",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "mkt_agree": {
          "head": "mkt_agree",
          "asAttribute": {
            "key": "mkt_agree",
            "type": "Boolean",
            "skip": false
          },
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "dsr_source": {
          "head": "dsr_source",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_own_car": {
          "head": "is_own_car",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "loan_count": {
          "head": "loan_count",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "income_type": {
          "head": "income_type",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_kcb_link": {
          "head": "is_kcb_link",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "company_name": {
          "head": "company_name",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "credit_score": {
          "head": "credit_score",
          "asAttribute": {
            "key": "credit_score",
            "type": "Number",
            "skip": false
          },
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_d7_review": {
          "head": "is_d7_review",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_donotcall": {
          "head": "is_donotcall",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "add_org_agree": {
          "head": "add_org_agree",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "bill_org_name": {
          "head": "bill_org_name",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "houseown_type": {
          "head": "houseown_type",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_ln_bal_chg": {
          "head": "is_ln_bal_chg",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "ovd_prv_agree": {
          "head": "ovd_prv_agree",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "revolving_amt": {
          "head": "revolving_amt",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "var_loan_rate": {
          "head": "var_loan_rate",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "card_bill_date": {
          "head": "card_bill_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_ln_acct_cls": {
          "head": "is_ln_acct_cls",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_ln_acct_opn": {
          "head": "is_ln_acct_opn",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_mydata_link": {
          "head": "is_mydata_link",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_1m_appl": {
          "head": "recent_1m_appl",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_3m_appl": {
          "head": "recent_3m_appl",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_7d_appl": {
          "head": "recent_7d_appl",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_crd_card_cxl": {
          "head": "is_crd_card_cxl",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_crd_card_del": {
          "head": "is_crd_card_del",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_crd_card_reg": {
          "head": "is_crd_card_reg",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "kcb_change_date": {
          "head": "kcb_change_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "overdue_bal_amt": {
          "head": "overdue_bal_amt",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_exp_date": {
          "head": "recent_exp_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_kcb_date": {
          "head": "recent_kcb_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_repay_account": {
          "head": "is_repay_account",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "my_ln_info_agree": {
          "head": "my_ln_info_agree",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_appl_date": {
          "head": "recent_appl_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_repay_amt": {
          "head": "recent_repay_amt",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "credit_score_date": {
          "head": "credit_score_date",
          "asAttribute": {
            "key": "credit_score_date",
            "type": "Date",
            "dateFormat": "yyyy-MM-dd",
            "skip": false
          },
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_ln_overdue_cls": {
          "head": "is_ln_overdue_cls",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_ln_overdue_del": {
          "head": "is_ln_overdue_del",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_ln_overdue_reg": {
          "head": "is_ln_overdue_reg",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_nextweek_repay": {
          "head": "is_nextweek_repay",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_repay_date": {
          "head": "recent_repay_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_exp_1_week_left": {
          "head": "is_exp_1_week_left",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_exp_2_week_left": {
          "head": "is_exp_2_week_left",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_1m_contract": {
          "head": "recent_1m_contract",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_3m_contract": {
          "head": "recent_3m_contract",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_7d_contract": {
          "head": "recent_7d_contract",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_mydata_date": {
          "head": "recent_mydata_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_repay_count": {
          "head": "recent_repay_count",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_review_date": {
          "head": "recent_review_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "company_enter_month": {
          "head": "company_enter_month",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_card_overdue_cls": {
          "head": "is_card_overdue_cls",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_card_overdue_del": {
          "head": "is_card_overdue_del",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_card_overdue_reg": {
          "head": "is_card_overdue_reg",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_exp_1_month_left": {
          "head": "is_exp_1_month_left",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_exp_2_month_left": {
          "head": "is_exp_2_month_left",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_mydata_incomplete": {
          "head": "is_mydata_incomplete",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "member_register_time": {
          "head": "member_register_time",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_contract_date": {
          "head": "recent_contract_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "next_savings_exp_date": {
          "head": "next_savings_exp_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "nextweek_repay_amount": {
          "head": "nextweek_repay_amount",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "prev_savings_exp_date": {
          "head": "prev_savings_exp_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_kcb_more_than_mydata": {
          "head": "is_kcb_more_than_mydata",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "mydata_consent_end_date": {
          "head": "mydata_consent_end_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "int_rate_increase_org_name": {
          "head": "int_rate_increase_org_name",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_refinance_appl_date": {
          "head": "recent_refinance_appl_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "count_refinancing_condition": {
          "head": "count_refinancing_condition",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "int_rate_increase_prod_name": {
          "head": "int_rate_increase_prod_name",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "yesterday_diff_credit_score": {
          "head": "yesterday_diff_credit_score",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_direct_refinancing_target": {
          "head": "is_direct_refinancing_target",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_refinance_contract_date": {
          "head": "recent_refinance_contract_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "count_direct_refinancing_condition": {
          "head": "count_direct_refinancing_condition",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "recent_direct_refinance_contract_date": {
          "head": "recent_direct_refinance_contract_date",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_direct_refinancing_contract_before_15days": {
          "head": "is_direct_refinancing_contract_before_15days",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_direct_refinancing_contract_before_6months": {
          "head": "is_direct_refinancing_contract_before_6months",
          "isPrimary": false,
          "doNotOverwrite": false
        },
        "is_direct_refinancing_repayday_account_yesterday": {
          "head": "is_direct_refinancing_repayday_account_yesterday",
          "isPrimary": false,
          "doNotOverwrite": false
        }
      },
      "importOption": "NEW",
      "fileKey": "${UPLOADED_FILE_KEY}"
    }`,
    devOrProdUrl
  );

  // Verify upload finished
  let numPages = 0;
  let expectedPages = Math.floor(NUM_CUSTOMERS / 10);
  let prevNumPages = 0;
  let pageRetries = 0;

  while (numPages < expectedPages) {
    sleep(POLLING_MINUTES * 60);
    response = httpxWrapper.getOrFail(
      "/customers?take=10&skip=0&searchKey=&searchValue=&orderBy=createdAt&orderType=desc",
      null,
      devOrProdUrl
    );
    numPages = parseInt(response.json("totalPages"));

    let deltaPages = numPages - prevNumPages;
    customersImported.add(deltaPages * 10);
    customersImportedTime.add(POLLING_MINUTES * 60);

    if (prevNumPages === numPages) {
      reporter.log(
        `Customer page count hasn't increased since last poll. Current pages: ${numPages}. number of retries: ${pageRetries}`
      );
      reporter.log(`Sent count hasn't increased breaking from loop`);
      if (pageRetries > 2) {
        reporter.report(
          `Sent count hasn't increased in 5 retries. Failing test...`
        );
        break;
        fail(
          `Import customers has failed after ${numPages} imported, but ${expectedPages} pages expected.`
        );
      }
      pageRetries = pageRetries + 1;
    } else {
      pageRetries = 0;
    }
    reporter.report(
      `Checking status of customer import. ${numPages} pages imported. ${expectedPages} pages expected.`
    );
    if (numPages < expectedPages) {
      //sleep(30);
      prevNumPages = numPages;
    }
  }
  reporter.report(
    `Customer import process completed. ${numPages} customer pages loaded.`
  );
  reporter.removeTimer("startImport");
  reporter.removeTimer("customerImport");

  // Additional steps as needed per original script
}

// Add the handleSummary function from the original script here if necessary
