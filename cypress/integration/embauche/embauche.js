const salaryInput = inputTitle => {
	const inputContainer = cy
		.contains(inputTitle)
		.closest('.main')
		.find('.targetInputOrValue')
	inputContainer.click()
	return inputContainer.find('input')
}

describe('Landing basic test', function() {
	it('should not crash', function() {
		cy.visit('/')
	})
	it('should display the simulateur after loading', function() {
		cy.visit('/')
		cy.contains('Entrez un salaire mensuel')
	})
	it('should display cotisation repartition when entering net salary', function() {
		cy.visit('/')
		salaryInput('Salaire net').type('2000')
		cy.get('.distribution-chart__container')
	})
	it('should allow to navigate to the aid page', function() {
		cy.visit('/')
		salaryInput('Salaire net').type('2000')
		cy.contains("d'aides").click()
		cy.contains('Aides employeur')
	})
})

describe('Iframe integration test', function() {
	it('should display an iframe of the simulateur', function() {
		cy.visit('/integration-test')
		cy.get('#simulateurEmbauche')
			.iframe()
			.contains('Entrez un salaire mensuel')
		cy.debug()
	})
})
