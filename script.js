import http from 'k6/http';
import { sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  /* Option 0: Smoke test */
   vus: 5,
   duration: '10m',

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
      name: "mahamad"
    }
  }
  let res = http.post(
    // 'https://api.laudspeaker.com/customers/upsert',
    'http://localhost:3001/customers/upsert',
    `{"primary_key":"${uuidv4()}","properties":{"name":"mahamad"}}`,
    {
      headers: {
        'Authorization': 'Api-Key X0rsmyqAFSIl80uD9SC5B4Fy9cfzNO1pHCs8d6xT',
        'Content-Type': 'application/json'
      }
    })

  // console.log(JSON.stringify(res, null, 2))
  // sleep(1);
}
