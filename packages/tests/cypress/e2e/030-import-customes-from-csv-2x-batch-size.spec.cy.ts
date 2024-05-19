import credentials from "../fixtures/credentials";
import drag from "../test-helpers/drag";
import { loginFunc } from "../test-helpers/loginFunc";
import { setupOrganization } from "../test-helpers/setupOrganization";
import signup from "../test-helpers/signup";
import { uploadCSV } from "../test-helpers/uploadCSV";
import { createPrimaryKey } from "../test-helpers/createPrimaryKey";
import { verifyTotalNumberOfCustomerPages } from "../test-helpers/verifyTotalNumberOfCustomerPages";

const { email, password, firstName, lastName, organizationName, timeZone } =
  credentials;

describe("test importing multiples of batch size", () => {
  beforeEach(() => {
    cy.request(`${Cypress.env("TESTS_API_BASE_URL")}/tests/reset-tests`);
    cy.wait(1000);
    cy.clearAllCookies();
    cy.clearAllLocalStorage();
    cy.clearAllSessionStorage();
    signup(email, password, firstName, lastName);
    cy.wait(1000);
  });

  it("test 2x batch size", () => {
    cy.viewport(1920, 1080);
    setupOrganization(organizationName, timeZone);

    createPrimaryKey("user_id");
    uploadCSV("20k.csv");

    verifyTotalNumberOfCustomerPages(2000);
  });

  it("test 2.5x batch size", () => {
    cy.viewport(1920, 1080);
    setupOrganization(organizationName, timeZone);

    createPrimaryKey("user_id");
    uploadCSV("./25k.csv", null, 30000);

    verifyTotalNumberOfCustomerPages(2500);
  });
});

