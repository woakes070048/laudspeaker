import "@4tw/cypress-drag-drop";

export const uploadCSV = (filename: string, mappingCallBack: () => any, waitDelay: number = 20000) => {
  cy.visit("/people");

  cy.wait(1000);
  
  cy.get("#import-customer-button").click({
    force: true,
  });

  cy.get("#dropzone-file", { timeout: 40000 }).selectFile(
    {
      // path relative to the cypress configuration file
      contents: `cypress/fixtures/${filename}`,
    },
    {
      // input element is hidden, so we need to force the upload
      force: true,
    }
  );

  cy.get("#import-file-name", { timeout: 60000 }).should("be.visible");

  cy.get("#next-button").click({ force: true });

  cy.wait(1000);
  
  if(mappingCallBack)
  {
    mappingCallBack();

    cy.wait(1000);

    cy.get("#next-button").click();

    cy.wait(500);

    cy.get("[data-testid='confirm-validation-button']").click();
  }
  else
  {
    cy.get("#next-button").click();  
  }

  cy.wait(500);

  cy.get("#import-button").click();

  cy.contains("Import started").should("be.visible");

  cy.wait(waitDelay);
};
