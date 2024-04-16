import http from "k6/http";
import { sleep } from "k6";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

export const options = {
  /* Option 0: Smoke test */
  vus: 5,
  duration: "5s",

  /* Option 1: Average load test*/

  // stages: [
  //   { duration: '5m', target: 100 }, // traffic ramp-up from 1 to 100 users over 5 minutes.
  //   { duration: '30m', target: 100 }, // stay at 100 users for 30 minutes
  //   { duration: '5m', target: 0 }, // ramp-down to 0 users
  // ],

  /* Option 2: Stress test */

  // stages: [
  //   { duration: '10m', target: 200 }, // traffic ramp-up from 1 to a higher 200 users over 10 minutes.
  //   { duration: '30m', target: 200 }, // stay at higher 200 users for 30 minutes
  //   { duration: '5m', target: 0 }, // ramp-down to 0 users
  // ],

  /* Option 3: Soak test */

  // stages: [
  //   { duration: '5m', target: 100 }, // traffic ramp-up from 1 to 100 users over 5 minutes.
  //   { duration: '8h', target: 100 }, // stay at 100 users for 8 hours!!!
  //   { duration: '5m', target: 0 }, // ramp-down to 0 users
  // ],

  /* Option 4: Spike test */

  // stages: [
  //   { duration: '5m', target: 3000 }, // fast ramp-up to a high point
  //   // No plateau
  //   { duration: '1m', target: 0 }, // quick ramp-down to 0 users
  // ],

  /* Option 5: Breakpoint test */

  // executor: 'ramping-arrival-rate', //Assure load increase if the system slows
  // stages: [
  //   { duration: '2h', target: 20000 }, // just slowly ramp-up to a HUGE load
  // ],
};

export default function () {
  let data = {
    primary_key: uuidv4(),
    properties: {
      name: "mahamad",
    },
  };
  let temp_id = uuidv4();
  let res = http.post(
    // 'https://api.laudspeaker.com/customers/upsert',
    "http://localhost:3001/events/batch",
    `{
      "batch": [
      {
        "timestamp": "2024-03-15T02:31:05.295Z",
        "uuid": "F451DF0A-D713-4076-AE20-41AB1641BC98",
        "event": "$identify",
        "source": "mobile",
        "correlationKey": "_id",
        "payload": {
          "$anon_distinct_id": "FBBBCB26-B75E-4342-B40B-568BF879F7C5",
          "distinct_id": "2001704"
        },
        "correlationValue": "${temp_id}"
      },
      {
        "timestamp": "2024-03-15T02:31:05.313Z",
        "uuid": "A97E8A44-AAB0-45C6-B68D-3CAD9A0ED0DD",
        "correlationKey": "_id",
        "correlationValue": "${temp_id}",
        "source": "mobile",
        "event": "$set",
        "payload": {
          "mkt_agree": true
        }
      },
      {
        "correlationKey": "_id",
        "source": "mobile",
        "uuid": "24291D14-944D-4C7B-B0E4-EC98B8A9DF46",
        "correlationValue": "${temp_id}",
        "event": "MY_home_view",
        "payload": {
          "service": "MY",
          "user": "KCB미연결",
          "tap": "open"
        },
        "timestamp": "2024-03-15T02:31:05.333Z"
      },
      {
        "source": "mobile",
        "correlationValue": "${temp_id}",
        "event": "MY_home_view",
        "correlationKey": "_id",
        "uuid": "46300C36-EB75-483D-9955-555233CE648C",
        "payload": {
          "service": "MY",
          "user": "KCB미연결",
          "tap": "main"
        },
        "timestamp": "2024-03-15T02:31:05.353Z"
      },
      {
        "source": "mobile",
        "correlationKey": "_id",
        "correlationValue": "${temp_id}",
        "payload": {
          "id": 2,
          "service": "MY"
        },
        "timestamp": "2024-03-15T02:31:05.443Z",
        "uuid": "C3EE7322-CBA2-49C4-B118-87DD86AAA5D0",
        "event": "MY_banner_list_view"
      }
    ]
  }`,
    {
      headers: {
        Authorization: "Api-Key UxLhrWODANbwW8gLDsqfQxqhsno5yB7JFbpROsoh",
        "Content-Type": "application/json",
      },
    }
  );

  // console.log(JSON.stringify(res, null, 2))
  // sleep(1);
}
