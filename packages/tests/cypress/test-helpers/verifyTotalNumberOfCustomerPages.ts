export const verifyTotalNumberOfCustomerPages = (expectedNumOfCustomerPages: number) => {
  cy.visit("/people");

  cy.get("#people-table-pagination button:nth-last-child(2)").should($lastPage => {
    const customersLastPageNumber = +$lastPage.text();

    expect(customersLastPageNumber, "Total number of customers").to.equal(expectedNumOfCustomerPages);
  });
};
