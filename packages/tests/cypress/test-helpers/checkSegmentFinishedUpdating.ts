const checkSegmentStatus = (segmentName: string) => {
	return cy.contains('table tbody tr', segmentName)
		.find('td')
		.eq(3)
		.invoke('text')
		.then((status) => {
			return status.trim() === 'Updated';
		});
};

export const checkSegmentFinishedUpdating = (segmentName: string, retryInterval: number, maxRetries: number) => {
	let attempts = 0;

	const attemptCheck = () => {
		cy.log(`Attempt ${attempts + 1}`);
		attempts += 1;

		checkSegmentStatus(segmentName).then((isUpdated) => {
			if (isUpdated) {
				cy.log('Segment has been updated');
			} else if (attempts < maxRetries) {
				cy.wait(retryInterval).then(() => {
					cy.reload()
					attemptCheck();
				});
			} else {
				cy.log('Maximum retries reached and segment is still updating');
				throw new Error('Maximum retries reached and segment is still updating');
			}
		});
	};

	attemptCheck();
};