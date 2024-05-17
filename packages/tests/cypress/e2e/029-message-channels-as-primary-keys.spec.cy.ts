import credentials from "../fixtures/credentials";
import createTestCustomer from "../test-helpers/createTestCustomer";
import drag from "../test-helpers/drag";
import { loginFunc } from "../test-helpers/loginFunc";
import setMailgun from "../test-helpers/setMailgun";
import { setupOrganization } from "../test-helpers/setupOrganization";
import signup from "../test-helpers/signup";
import uuid from "../test-helpers/uuid";

const { email, password, firstName, lastName, organizationName, timeZone } =
  credentials;

describe("batch and deduplication", () => {
  beforeEach(() => {
    cy.request(`${Cypress.env("TESTS_API_BASE_URL")}/tests/reset-tests`);
    cy.wait(1000);
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
    cy.clearAllSessionStorage();
    signup(email, password, firstName, lastName);
    cy.wait(1000);
  });

  it("match with iosDeviceToken", () => {
    cy.viewport(1920, 1080);
    setupOrganization(organizationName, timeZone);
    cy.get("#settings").click();
    cy.contains("API").click();
    cy.wait(1000);
    cy.get("#privateAPIKey")
      .invoke("val")
      .then((val) => {
        const apikey = val?.toString() || "no";
        createTestCustomer(email, ["iosDeviceToken"]);
        cy.wait(1000);

        const uuid1 = "d97e25e2-2bce-4f87-b795-cb4e737909ac";
        const uuid2 = "f0f6765f-0fbd-4636-b4ca-1d6863946d9c";

        cy.request({
          method: "POST",
          url: `${Cypress.env("TESTS_API_BASE_URL")}/events/batch`,
          headers: { Authorization: `Api-Key ${apikey}` },
          body: {
            batch: [
              {
                timestamp: "2024-03-15T02:31:05.295Z",
                uuid: "F451DF0A-D713-4076-AE20-41AB1641BC98",
                event: "$identify",
                source: "mobile",
                correlationKey: "_id",
                payload: {
                  $anon_distinct_id: uuid1,
                  distinct_id: email,
                },
                $fcm: { iosDeviceToken: "J841fzK7PM540pLqtquVBsV0w2VPmeU0MFjHeh1IhMg5uce8ZOM9WSvMWqzX0YVq" },
                correlationValue: uuid1,
              },
              {
                timestamp: "2024-03-15T02:31:05.295Z",
                uuid: "ddecc554-1978-455c-ad06-bbc294d728ff",
                event: "$identify",
                source: "mobile",
                correlationKey: "_id",
                payload: {
                  $anon_distinct_id: uuid2,
                  distinct_id: "john@smith.com",
                },
                $fcm: { iosDeviceToken: "J841fzK7PM540pLqtquVBsV0w2VPmeU0MFjHeh1IhMg5uce8ZOM9WSvMWqzX0YVq" },
                correlationValue: uuid2,
              },
            ],
          },
        }).then(() => {
          cy.wait(1000);

          cy.get("#users").click();

          cy.get('.id-cell').should('have.length', 1);

          cy.get(".id-cell:first").click();
          cy.contains(uuid1).should("exist");
          cy.contains(uuid2).should("exist");
          cy.contains("iosDeviceToken").should("exist");
          cy.contains("J841fzK7PM540pLqtquVBsV0w2VPmeU0MFjHeh1IhMg5uce8ZOM9WSvMWqzX0YVq").should("exist");
        });
      });
  });

  it("match with androidDeviceToken", () => {
    cy.viewport(1920, 1080);
    setupOrganization(organizationName, timeZone);
    cy.get("#settings").click();
    cy.contains("API").click();
    cy.wait(1000);
    cy.get("#privateAPIKey")
      .invoke("val")
      .then((val) => {
        const apikey = val?.toString() || "no";
        createTestCustomer(email, ["androidDeviceToken"]);
        cy.wait(1000);

        const uuid1 = "75de0eaf-15ec-4954-999d-69a67bf10a1c";
        const uuid2 = "25282ba2-bcab-4a66-a2ac-cdcb9afdc4f9";

        cy.request({
          method: "POST",
          url: `${Cypress.env("TESTS_API_BASE_URL")}/events/batch`,
          headers: { Authorization: `Api-Key ${apikey}` },
          body: {
            batch: [
              {
                timestamp: "2024-03-15T02:31:05.295Z",
                uuid: "F451DF0A-D713-4076-AE20-41AB1641BC98",
                event: "$identify",
                source: "mobile",
                correlationKey: "_id",
                payload: {
                  $anon_distinct_id: uuid1,
                  distinct_id: email,
                },
                $fcm: { androidDeviceToken: "X3hevrlRB5ppM7J4uVyhVfXaQVWgxI6eYlr1dSzBpEOToi40TX8iG4wGMZOg0KpS" },
                correlationValue: uuid1,
              },
              {
                timestamp: "2024-03-15T02:31:05.295Z",
                uuid: "ddecc554-1978-455c-ad06-bbc294d728ff",
                event: "$identify",
                source: "mobile",
                correlationKey: "_id",
                payload: {
                  $anon_distinct_id: uuid2,
                  distinct_id: "john@smith.com",
                },
                $fcm: { androidDeviceToken: "X3hevrlRB5ppM7J4uVyhVfXaQVWgxI6eYlr1dSzBpEOToi40TX8iG4wGMZOg0KpS" },
                correlationValue: uuid2,
              },
            ],
          },
        }).then(() => {
          cy.wait(1000);

          cy.get("#users").click();

          cy.get('.id-cell').should('have.length', 1);

          cy.get(".id-cell:first").click();
          cy.contains(uuid1).should("exist");
          cy.contains(uuid2).should("exist");
          cy.contains("androidDeviceToken").should("exist");
          cy.contains("X3hevrlRB5ppM7J4uVyhVfXaQVWgxI6eYlr1dSzBpEOToi40TX8iG4wGMZOg0KpS").should("exist");
        });
      });
  });  

  it("match with phone_number", () => {
    cy.viewport(1920, 1080);
    setupOrganization(organizationName, timeZone);
    cy.get("#settings").click();
    cy.contains("API").click();
    cy.wait(1000);
    cy.get("#privateAPIKey")
      .invoke("val")
      .then((val) => {
        const apikey = val?.toString() || "no";
        createTestCustomer(email, ["phone_number"]);
        cy.wait(1000);

        const uuid1 = "0850f0f8-190f-4797-b222-0074a0724a60";
        const uuid2 = "e38b9f73-f036-49de-a6e7-ee664437038d";

        cy.request({
          method: "POST",
          url: `${Cypress.env("TESTS_API_BASE_URL")}/events/batch`,
          headers: { Authorization: `Api-Key ${apikey}` },
          body: {
            batch: [
              {
                timestamp: "2024-03-15T02:31:05.295Z",
                uuid: "F451DF0A-D713-4076-AE20-41AB1641BC98",
                event: "$identify",
                source: "mobile",
                correlationKey: "_id",
                payload: {
                  $anon_distinct_id: uuid1,
                  distinct_id: email,
                  phone_number: "123-456-7890",
                },
                correlationValue: uuid1,
              },
              {
                timestamp: "2024-03-15T02:31:05.295Z",
                uuid: "ddecc554-1978-455c-ad06-bbc294d728ff",
                event: "$identify",
                source: "mobile",
                correlationKey: "_id",
                payload: {
                  $anon_distinct_id: uuid2,
                  distinct_id: "john@smith.com",
                },
                phone_number: "123-456-7890",
                correlationValue: uuid2,
              },
            ],
          },
        }).then(() => {
          cy.wait(1000);

          cy.get("#users").click();

          cy.get('.id-cell').should('have.length', 1);

          cy.get(".id-cell:first").click();
          cy.contains(uuid1).should("exist");
          cy.contains(uuid2).should("exist");
          cy.contains("phone_number").should("exist");
          cy.contains("123-456-7890").should("exist");
        });
      });
  });

  it("match with phone_number_with_ext", () => {
    cy.viewport(1920, 1080);
    setupOrganization(organizationName, timeZone);
    cy.get("#settings").click();
    cy.contains("API").click();
    cy.wait(1000);
    cy.get("#privateAPIKey")
      .invoke("val")
      .then((val) => {
        const apikey = val?.toString() || "no";
        createTestCustomer(email, ["phone_number_with_ext"]);
        cy.wait(1000);

        const uuid1 = "31203328-553a-4d66-887c-0aeaaf95f16b";
        const uuid2 = "a3ef754c-6499-41d1-b63a-86f3c6550300";

        cy.request({
          method: "POST",
          url: `${Cypress.env("TESTS_API_BASE_URL")}/events/batch`,
          headers: { Authorization: `Api-Key ${apikey}` },
          body: {
            batch: [
              {
                timestamp: "2024-03-15T02:31:05.295Z",
                uuid: "F451DF0A-D713-4076-AE20-41AB1641BC98",
                event: "$identify",
                source: "mobile",
                correlationKey: "_id",
                payload: {
                  $anon_distinct_id: uuid1,
                  distinct_id: email,
                  phone_number_with_ext: "+1 000-111-2222",
                },
                correlationValue: uuid1,
              },
              {
                timestamp: "2024-03-15T02:31:05.295Z",
                uuid: "ddecc554-1978-455c-ad06-bbc294d728ff",
                event: "$identify",
                source: "mobile",
                correlationKey: "_id",
                payload: {
                  $anon_distinct_id: uuid2,
                  distinct_id: "john@smith.com",
                },
                phone_number_with_ext: "+1 000-111-2222",
                correlationValue: uuid2,
              },
            ],
          },
        }).then(() => {
          cy.wait(1000);

          cy.get("#users").click();

          cy.get('.id-cell').should('have.length', 1);

          cy.get(".id-cell:first").click();
          cy.contains(uuid1).should("exist");
          cy.contains(uuid2).should("exist");
          cy.contains("phone_number_with_ext").should("exist");
          cy.contains("+1 000-111-2222").should("exist");
        });
      });
  });
});
