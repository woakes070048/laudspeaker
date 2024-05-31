import { sleep, fail } from "k6";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";
import http from "k6/http";
import { Httpx } from "https://jslib.k6.io/httpx/0.1.0/index.js";
import { Counter } from "k6/metrics";
import { createAccount } from "./utils/accounts.js";
import { Reporter, HttpxWrapper, failOnError } from "./utils/common.js";

/*
 * Depending on how you are testing, you need to change
 * devOrProdUrl = "" to devOrProdUrl = "/api"
 *
 * and use the right upload csv option post call
 *
 */

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

const customersImported = new Counter("customers_imported");
const customersImportedTime = new Counter("customers_imported_time");
const customersMessaged = new Counter("customers_messaged");
const customersMessagedTime = new Counter("customers_messaged_time");

// Test config
const EMAIL =
  __ENV.EMAIL || `perf${String(Math.random()).substring(2, 7)}@test.com`;
//const UPLOAD_FILE = open(__ENV.CSV_FILEPATH, "b");
const POLLING_MINUTES = parseFloat(__ENV.POLLING_MINUTES) || 1;
const PRIMARY_KEY_HEADER = "user_id";
const source = "source";
const mkt_agree = "mkt_agree";
const credit_score = "credit_score";
const credit_score_date = "credit_score_date";
//const NUM_CUSTOMERS = __ENV.NUM_CUSTOMERS || fail("NUM_CUSTOMERS required");
const UPLOAD_TIMEOUT = __ENV.UPLOAD_TIMEOUT || "600s";
let BASE_URL = __ENV.BASE_URL || fail("BASE_URL required");
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

/*
 * should replace this to read in from env
 */

const attributes = [
  { name: "user_id", type: "String" },
  { name: "source", type: "String" },
  { name: "mkt_agree", type: "Boolean" },
  { name: "credit_score", type: "Number" },
  { name: "credit_score_date", type: "Date", dateFormat: "yyyy-MM-dd" },
  { name: "company_name", type: "String" },
]

let customerData = JSON.parse(open(__ENV.JSON_FILEPATH));

export default function main() {
  let response;
  let UPLOADED_FILE_KEY;
  let httpxWrapper = new HttpxWrapper(session);

  let devOrProdUrl = "";

  let reporter = new Reporter("SETUP");
  reporter.addTimer("totalElapsed", "Total elapsed time of k6 test");
  reporter.report(
    `Started script with email: ${EMAIL}`
  );

  reporter.setStep("CREATE_ACCOUNT");
  reporter.addTimer("createAccount", "Elapsed time of create account");
  reporter.log(`Creating account and organization`);

  // CREATE ACCOUNT and set Auth header
  let { authorization, email, password, apiKey } = createAccount(EMAIL, httpxWrapper);
  console.log(authorization, email, password);

  reporter.report(`Finished creating account and organization.`);
  reporter.log(`Email: ${email}`);
  reporter.log(`Authorization header: ${authorization}`);
  reporter.removeTimer("createAccount");

  // SET UP SCHEMA
  reporter.log(`Creating customer attributes`);

  for (let attr of attributes) {
    let attributePayload = `{"name":"${attr.name}","type":"${attr.type}"`;
    if (attr.dateFormat) {
      attributePayload += `,"dateFormat":"${attr.dateFormat}"`;
    }
    attributePayload += '}';
    response = httpxWrapper.postOrFail(
      "/customers/attributes/create",
      attributePayload,
      devOrProdUrl
    );
  }

  // Update Primary Key Attribute
  reporter.setStep("UPDATE_PRIMARY_KEY");
  let attributePayload = `{"key":"user_id","type":"String"}`;

  response = httpxWrapper.putOrFail(
    "/customers/primary-key",
    attributePayload,
    devOrProdUrl
  );

  // Upsert Customers
  reporter.setStep("CUSTOMER_UPSERT");
  reporter.report(`Starting customer upsert process`);
  reporter.addTimer("customerUpsert", "Total elapsed time of customer upsert");

  console.log("trying test data");
  let testData = JSON.stringify({
    primary_key: uuidv4(),
    properties: {
      mkt_agree: false,
      _id: uuidv4()
    },
  });
  let res = http.post(
    `${BASE_URL}/customers/upsert`,
    testData,
    {
      headers: {
        Authorization: "Api-Key " + apiKey, 
        "Content-Type": "application/json",
      },
    }
  );

  for (let customer of customerData) {
   
    //console.log("customer is")
    //console.log(JSON.stringify(customer,null, 2))

    let primaryKey = customer.user_id;
    let properties = {};
    for (let key in customer) {
      if (key !== "user_id") { // Skip user_id for the properties object
        properties[key] = customer[key];
      }
    }
    // Construct the new payload
    let data = {
      primary_key: primaryKey,
      properties: properties,
    };

    console.log("this is what we will post");
    console.log(JSON.stringify(data,null, 2))

    let res = http.post(
      `${BASE_URL}/customers/upsert`,
      data,
      {
        headers: {
          Authorization: "Api-Key " + apiKey, 
          "Content-Type": "application/json",
        },
      }
    );
    console.log(`Upserting customer: ${res.status}`);
    customersImported.add(1);  // Increment the counter for imported customers
  }

  reporter.removeTimer("customerUpsert");
}

  /*
  response = httpxWrapper.postOrFail(
    "/api/customers/attributes/create",
    `{"name":"${PRIMARY_KEY_HEADER}","type":"String"}`
  );
  
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
  */

 

