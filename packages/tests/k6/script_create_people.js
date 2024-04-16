import http from "k6/http";
import { sleep } from "k6";
import { uuidv4 } from "https://jslib.k6.io/k6-utils/1.4.0/index.js";

export const options = {
  /* Option 0: Smoke test */
  vus: 5,
  duration: "1s",

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

function randomDate(start, end) {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  )
    .toISOString()
    .split("T")[0];
}

function randomName() {
  const names = ["Mahamad", "Boson", "Atisa", "Plank", "Hyee Jun"];
  return names[Math.floor(Math.random() * names.length)];
}

export default function () {
  let creditScore = Math.floor(Math.random() * (800 - 400 + 1)) + 400;
  let loanDate = randomDate(new Date("2022-01-01"), new Date("2024-12-31"));
  let mktAgree = Math.random() < 0.5; // 50% chance to be true or false
  let name = randomName(); // Selects a random name from the list

  let data = JSON.stringify({
    primary_key: uuidv4(),
    properties: {
      name: name,
      credit_score: creditScore,
      loan_date: loanDate,
      mkt_agree: mktAgree,
    },
  });

  let res = http.post(
    // 'https://api.laudspeaker.com/customers/upsert',
    "http://localhost:3001/customers/upsert",
    data,
    //`{"primary_key":"${uuidv4()}","properties":{"name":"mahamad"}}`,
    {
      headers: {
        Authorization: "Api-Key R86XdJtbQqzNLbYL1ISwRyh7LQMC3MFAjwjTM6bw",
        "Content-Type": "application/json",
      },
    }
  );

  // console.log(JSON.stringify(res, null, 2))
  // sleep(1);
}
