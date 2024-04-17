import http from "k6/http";
export function createAccount(email, httpxWrapper, devOrProdUrl = "") {
  let password = "Password1$";
  let registerResponse = httpxWrapper.postOrFail(
    devOrProdUrl + "/auth/register",
    `{"firstName":"Test","lastName":"Test","email":"${email}","password":"${password}"}`
  );

  let authorization = `Bearer ${registerResponse.json("access_token")}`;
  httpxWrapper.session.addHeader("Authorization", authorization);
  let organizatonResponse = httpxWrapper.postOrFail(
    devOrProdUrl + "/organizations",
    '{"name":"Test","timezoneUTCOffset":"UTC-07:00"}'
  );

  let accountsResponse = httpxWrapper.getOrFail(devOrProdUrl + "/accounts");
  const apiKey = accountsResponse.json("workspace.apiKey");
  return { email, password, authorization, apiKey };
}

export function login(
  email,
  password,
  apiKey,
  httpxWrapper,
  devOrProdUrl = ""
) {
  // Assuming the API expects a JSON body with email and password for authentication
  let loginResponse = httpxWrapper.postOrFail(
    // this is correct but not for local
    //"/api/auth/login",
    devOrProdUrl + "/auth/login",
    `{"email":"${email}","password":"${password}"}`
  );

  // Extract the access token from the response
  let authorization = `Bearer ${loginResponse.json("access_token")}`;

  // Set the Authorization header for subsequent requests
  httpxWrapper.session.addHeader("Authorization", authorization);

  // Optionally, if your API interactions require the apiKey, set it as a header or handle it accordingly
  // httpxWrapper.session.addHeader("x-api-key", apiKey);

  return { email, authorization, apiKey };
}
