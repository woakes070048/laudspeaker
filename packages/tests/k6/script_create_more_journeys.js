import { sleep, fail } from "k6";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";
import http from "k6/http";
import { Httpx } from "https://jslib.k6.io/httpx/0.1.0/index.js";
import { Counter } from "k6/metrics";
import { createAccount, login } from "./utils/accounts.js";
import { Reporter, HttpxWrapper, failOnError } from "./utils/common.js";

/*
 * this test is supposed to be used semi manually
 * ie a human creates the account, sets the end-user schema
 *
 * then puts the NUM_CUSTOMERS field in, as well as the
 * login params
 *
 * You can then use this test with others as well, and do
 * human testing all on the same acount
 */

export const options = {
  scenarios: {
    upload_and_send: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: 1,
      maxDuration: "2s",
    },
  },
};

const customersMessaged = new Counter("customers_messaged");
const customersMessagedTime = new Counter("customers_messaged_time");

// Test config
const EMAIL =
  __ENV.EMAIL || `perf${String(Math.random()).substring(2, 7)}@test.com`;
//const UPLOAD_FILE = open(__ENV.CSV_FILEPATH, "b");
const POLLING_MINUTES = parseFloat(__ENV.POLLING_MINUTES) || 1;
const PRIMARY_KEY_HEADER = "user_id";
//const NUM_CUSTOMERS = //__ENV.NUM_CUSTOMERS || fail("NUM_CUSTOMERS required");
//let BASE_URL = __ENV.BASE_URL || fail("BASE_URL required");
let BASE_URL = "http://localhost:3001/";
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
  let response;
  let UPLOADED_FILE_KEY;
  let httpxWrapper = new HttpxWrapper(session);

  let reporter = new Reporter("SETUP");
  reporter.addTimer("totalElapsed", "Total elapsed time of k6 test");
  /*
  reporter.report(
    `Started script with email: ${EMAIL} and file ${__ENV.CSV_FILEPATH}. Testing ${NUM_CUSTOMERS} customers.`
  );
  */

  reporter.setStep("LOGIN");
  reporter.addTimer("login", "Elapsed time of login");
  reporter.log(`Logging in with account`);

  // LOGIN and set Auth header. Replace createAccount with login here.
  // Make sure to define or retrieve the EMAIL, PASSWORD, and API_KEY variables appropriately.

  // to do put in the email, password, and api key as you want

  let { authorization, email } = login(
    "abe@bond.com",
    "irio24234newiJ3289yu*",
    "R86XdJtbQqzNLbYL1ISwRyh7LQMC3MFAjwjTM6bw",
    //"mykola.laudspeaker31@gmail.com",
    //"mykola.laudspeaker31@gmail.com",
    //"TbZcNQvP3MV4BgSzq8bia2OfkEdsQkYCh40JWYaV",
    httpxWrapper
  );
  console.log(`Logged in with ${email}, Authorization: ${authorization}`);

  reporter.report(`Finished logging in.`);
  reporter.log(`Email: ${email}`);
  reporter.log(`Authorization header: ${authorization}`);
  reporter.removeTimer("login");

  // STEP 3 CREATE JOURNEY
  for (let i = 0; i < 20; i++) {
    reporter.setStep("JOURNEY_CREATION");
    reporter.log(`Starting journey creation`);
    reporter.addTimer(
      "journeyCreation",
      "Time elapsed to create a simple journey"
    );
    reporter.log(`Posting new journey`);
    //response = httpxWrapper.postOrFail("/api/journeys", '{"name":"test"}');
    let journeyName = "[mykola]first_" + uuidv4();
    response = httpxWrapper.postOrFail(
      "/journeys",
      `{"name": "${journeyName}"}`
    );
    let visualLayout = response.json("visualLayout");
    const JOURNEY_ID = response.json("id");

    reporter.log(`Journey created with id: ${JOURNEY_ID}`);

    /*
    response = httpxWrapper.postOrFail(
      "/api/steps",
      `{"type":"message","journeyID":"${JOURNEY_ID}"}`
    );
    */
    response = httpxWrapper.postOrFail(
      "/steps",
      `{"type":"waitUntil","journeyID":"${JOURNEY_ID}"}`
    );

    const START_STEP_NODE = visualLayout.nodes[0];
    const START_STEP_EDGE = visualLayout.edges[0];
    const WAIT_UNTIL_STEP_ID = response.json("id");

    //response = httpxWrapper.getOrFail("/api/templates", {});

    let waitUntilStepNode = visualLayout.nodes[1];
    waitUntilStepNode.type = "waitUntil";

    const branch1UUID = uuidv4();
    const branch2UUID = uuidv4();

    waitUntilStepNode.data = {
      type: "waitUntil",
      stepId: WAIT_UNTIL_STEP_ID,
      branches: [
        {
          id: branch1UUID,
          type: "event",
          conditions: [
            {
              name: "example1",
              statements: [],
              providerType: "custom",
              relationToNext: "or",
            },
          ],
        },
        {
          id: branch2UUID,
          type: "event",
          conditions: [
            {
              name: "example2",
              statements: [],
              providerType: "custom",
              relationToNext: "or",
            },
          ],
        },
      ],
      showErrors: true,
    };

    response = httpxWrapper.getOrFail("/templates", {});
    const TEMPLATE_ONE = response.json("data")[0];
    const TEMPLATE_TWO = response.json("data")[1];

    response = httpxWrapper.postOrFail(
      "/steps",
      `{"type":"message","journeyID":"${JOURNEY_ID}"}`
    );

    const MESSAGE1_STEP_ID = response.json("id");
    const MESSAGE1_NODE_ID = uuidv4();

    const email1StepNode = {
      id: MESSAGE1_NODE_ID,
      data: {
        type: "message",
        stepId: MESSAGE1_STEP_ID,
        template: {
          type: "email",
          selected: { id: TEMPLATE_ONE.id, name: TEMPLATE_ONE.name },
        },
        customName: "Email 1",
        showErrors: true,
      },
      type: "message",
      position: {
        x: -260,
        y: 326,
      },
      selected: false,
    };

    response = httpxWrapper.postOrFail(
      "/steps",
      `{"type":"message","journeyID":"${JOURNEY_ID}"}`
    );

    const MESSAGE2_STEP_ID = response.json("id");
    const MESSAGE2_NODE_ID = uuidv4();

    const email2StepNode = {
      id: MESSAGE2_NODE_ID,
      data: {
        type: "message",
        stepId: MESSAGE2_STEP_ID,
        template: {
          type: "email",
          selected: { id: TEMPLATE_TWO.id, name: TEMPLATE_TWO.name },
        },
        customName: "Email 2",
        showErrors: true,
      },
      type: "message",
      position: {
        x: 260,
        y: 326,
      },
      selected: false,
    };

    const waitUntilBranch1 = {
      id: `b${branch1UUID}`,
      data: {
        type: "branch",
        branch: {
          id: branch1UUID,
          type: "event",
          conditions: [
            {
              name: "example1",
              statements: [],
              providerType: "custom",
              relationToNext: "or",
            },
          ],
        },
      },
      type: "branch",
      source: waitUntilStepNode.id,
      target: email1StepNode.id,
    };

    const waitUntilBranch2 = {
      id: `b${branch2UUID}`,
      data: {
        type: "branch",
        branch: {
          id: branch2UUID,
          type: "event",
          conditions: [
            {
              name: "example2",
              statements: [],
              providerType: "custom",
              relationToNext: "or",
            },
          ],
        },
      },
      type: "branch",
      source: waitUntilStepNode.id,
      target: email2StepNode.id,
    };

    /*
    response = httpxWrapper.postOrFail(
      "/api/steps",
      `{"type":"exit","journeyID":"${JOURNEY_ID}"}`
    );
    */

    response = httpxWrapper.postOrFail(
      "/steps",
      `{"type":"exit","journeyID":"${JOURNEY_ID}"}`
    );

    const EXIT1_STEP_ID = response.json("id");
    const EXIT1_STEP_NODE_ID = uuidv4();

    const exit1StepNode = {
      id: EXIT1_STEP_NODE_ID,
      data: {
        stepId: EXIT1_STEP_ID,
        showErrors: true,
      },
      type: "exit",
      position: {
        x: -260,
        y: 440,
      },
      selected: false,
    };

    const toExitEdge1 = {
      id: `e${email1StepNode.id}-${exit1StepNode.id}`,
      type: "primary",
      source: email1StepNode.id,
      target: exit1StepNode.id,
    };

    response = httpxWrapper.postOrFail(
      "/steps",
      `{"type":"exit","journeyID":"${JOURNEY_ID}"}`
    );

    const EXIT2_STEP_ID = response.json("id");
    const EXIT2_STEP_NODE_ID = uuidv4();

    const exit2StepNode = {
      id: EXIT2_STEP_NODE_ID,
      data: {
        stepId: EXIT2_STEP_ID,
        showErrors: true,
      },
      type: "exit",
      position: {
        x: 260,
        y: 440,
      },
      selected: false,
    };

    const toExitEdge2 = {
      id: `e${email2StepNode.id}-${exit2StepNode.id}`,
      type: "primary",
      source: email2StepNode.id,
      target: exit2StepNode.id,
    };

    let visualLayoutBody = JSON.stringify({
      id: JOURNEY_ID,
      nodes: [
        START_STEP_NODE,
        waitUntilStepNode,
        email1StepNode,
        email2StepNode,
        exit1StepNode,
        exit2StepNode,
      ],
      edges: [
        START_STEP_EDGE,
        waitUntilBranch1,
        waitUntilBranch2,
        toExitEdge1,
        toExitEdge2,
      ],
    });

    /*
    response = httpxWrapper.patchOrFail(
      "/api/journeys/visual-layout",
      visualLayoutBody
    );

    response = httpxWrapper.patchOrFail(
      "/api/journeys",
      `{"id":"${JOURNEY_ID}","name":"test","inclusionCriteria":{"type":"allCustomers"},"isDynamic":true,"journeyEntrySettings":{"entryTiming":{"type":"WhenPublished"},"enrollmentType":"CurrentAndFutureUsers"},"journeySettings":{"tags":[],"maxEntries":{"enabled":false,"limitOnEverySchedule":false,"maxEntries":"500000"},"quietHours":{"enabled":false,"startTime":"00:00","endTime":"08:00","fallbackBehavior":"NextAvailableTime"},"maxMessageSends":{"enabled":false}}}`
    );
    */

    reporter.report(visualLayoutBody);

    response = httpxWrapper.patchOrFail(
      "/journeys/visual-layout",
      visualLayoutBody
    );

    response = httpxWrapper.patchOrFail(
      "/journeys",
      `{"id":"${JOURNEY_ID}","name":"${journeyName}","inclusionCriteria":{"type":"allCustomers"},"isDynamic":true,"journeyEntrySettings":{"entryTiming":{"type":"WhenPublished"},"enrollmentType":"CurrentAndFutureUsers"},"journeySettings":{"tags":[],"maxEntries":{"enabled":false,"limitOnEverySchedule":false,"maxEntries":"500000"},"quietHours":{"enabled":false,"startTime":"00:00","endTime":"08:00","fallbackBehavior":"NextAvailableTime"},"maxMessageSends":{"enabled":false}}}`
    );
    reporter.report(`Journey creation completed.`);
    reporter.removeTimer("journeyCreation");

    reporter.setStep("CUSTOMER_MESSAGING");
    reporter.log(`Starting journey.`);
    reporter.addTimer(
      "journeyMessaging",
      "Time elapsed since journey started triggering customer messages."
    );

    /*
    response = httpxWrapper.patchOrFail(
      `/journeys/start/${JOURNEY_ID}`,
      "{}"
    );
    */
    response = httpxWrapper.patchOrFail(`/journeys/start/${JOURNEY_ID}`, "{}");
    reporter.report(`Journey started.`);
  }

  /*

  reporter.log(`Check stats: /api/steps/stats/${MESSAGE_STEP_ID}`);

  let sentCount = 0;
  let retries = 0; // kill stat checking early if sent count not increasing
  let prevSentCount = 0;
  while (sentCount < NUM_CUSTOMERS) {
    sleep(POLLING_MINUTES * 60);
    response = httpxWrapper.getOrFail(`/api/steps/stats/${MESSAGE_STEP_ID}`);
    prevSentCount = sentCount;
    sentCount = parseInt(response.json("sent"));
    reporter.report(`Current sent messages: ${sentCount} of ${NUM_CUSTOMERS}`);
    let deltaSent = sentCount - prevSentCount;
    customersMessaged.add(deltaSent);
    customersMessagedTime.add(POLLING_MINUTES * 60);
    if (prevSentCount === sentCount) {
      reporter.log(
        `Sent count hasn't increased since last poll. Current count: ${sentCount}. number of retries: ${retries}`
      );
      if (retries > 5) {
        reporter.report(
          `Sent count hasn't increased in 5 retries. Failing test...`
        );
        fail(
          `Message customers has failed after ${sentCount} messages sent, but ${NUM_CUSTOMERS} messages expected.`
        );
      }
      retries = retries + 1;
    } else {
      retries = 0;
    }
  }
  reporter.report(`Test successfully finished.`);
  reporter.log(`Final sentCount: ${sentCount}.`);
  reporter.removeTimer("journeyMessaging");

  reporter.setStep(`CLEANUP`);
  reporter.log(`Deleting account ${email}`);
  response = httpxWrapper.deleteOrFail(
    `/api/accounts`,
    `{"password":"${password}"}`
  );
  reporter.log(`Account deleted.`);

  */
}

/*

export function handleSummary(data) {
  const imported = data.metrics["customers_imported"]
    ? data.metrics["customers_imported"].values.count
    : undefined;
  const importedTime = data.metrics["customers_imported_time"]
    ? data.metrics["customers_imported_time"].values.count
    : undefined; //seconds
  const messaged = data.metrics["customers_messaged"]
    ? data.metrics["customers_messaged"].values.count
    : undefined;
  const messagedTime = data.metrics["customers_messaged_time"]
    ? data.metrics["customers_messaged_time"].values.count
    : undefined; //seconds

  let summary = "SUMMARY:\n\n\n";
  summary += `Customers Imported: ${imported}\n`;
  summary += `Customers Imported Time (seconds): ${importedTime} seconds\n`;
  summary += `Customers Messaged: ${messaged}\n`;
  summary += `Customers Messaged Time (seconds): ${messagedTime} seconds\n\n`;

  if (imported && importedTime) {
    summary += `Import Rate (per second): ${
      imported / importedTime
    } customers per second\n`;
    summary += `Import Rate (per minute): ${
      imported / (importedTime / 60)
    } customers per minute\n\n`;
  } else {
    summary += `Import Rate: unkown due to error\n\n`;
  }

  if (messaged && messagedTime) {
    summary += `Message Send Rate (per second): ${
      messaged / messagedTime
    } customers per second\n`;
    summary += `Message Send Rate (per minute): ${
      messaged / (messagedTime / 60)
    } customers per minute\n`;
  } else {
    summary += `Import Rate: unknown due to error\n`;
  }

  return {
    stdout: summary,
  };
}
*/
