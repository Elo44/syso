import React from 'react'
import { Node, Leaf } from './mecanismViews/common'
import { findRuleByDottedName, disambiguateRuleReference } from './rules'
import { evaluateNode, rewriteNode, makeJsx } from './evaluation'
import { getSituationValue } from './variables'
import { Trans } from 'react-i18next'

// This function is a wrapper that can apply temporal transformations to the value of the variable.
// See the période.yaml test suite for details
export let treatPeriodTransform = (rules, rule) => variable => {
	let evaluate = (cache, situation, parsedRules, node) => {
		let explanation = evaluateNode(
			cache,
			situation,
			parsedRules,
			node.explanation
		)
		let nodeValue = explanation.nodeValue
		if (nodeValue == null)
			return rewriteNode(
				node,
				nodeValue,
				explanation,
				explanation.missingVariables
			)

		let ruleToTransform = findRuleByDottedName(
			rules,
			node.explanation.dottedName
		)

		let environmentPeriod = situation('période') || 'mois'
		let callingPeriod = rule['période'] || environmentPeriod
		let calledPeriod = ruleToTransform['période'] || environmentPeriod

		let newNodeValue =
			callingPeriod === 'mois' && calledPeriod === 'année'
				? nodeValue / 12
				: callingPeriod === 'année' && calledPeriod === 'mois'
					? nodeValue * 12
					: nodeValue

		return rewriteNode(
			node,
			newNodeValue,
			explanation,
			explanation.missingVariables
		)
	}

	return {
		type: 'periodTransform',
		jsx: () => null,
		explanation: variable,
		evaluate
	}
}

export let treatVariable = (rules, rule, filter) => parseResult => {
	let evaluate = (cache, situation, parsedRules, node) => {
		let dottedName = node.dottedName,
			// On va vérifier dans le cache courant, dict, si la variable n'a pas été déjà évaluée
			// En effet, l'évaluation dans le cas d'une variable qui a une formule, est coûteuse !
			cacheName = dottedName + (filter ? '.' + filter : ''),
			cached = cache[cacheName]

		if (cached) return cached

		let variable = findRuleByDottedName(parsedRules, dottedName),
			variableHasFormula = variable.formule != null,
			variableHasCond =
				variable['applicable si'] != null ||
				variable['non applicable si'] != null,
			situationValue = getSituationValue(situation, dottedName, variable),
			needsEvaluation =
				situationValue == null && (variableHasCond || variableHasFormula),
			explanation = needsEvaluation
				? evaluateNode(cache, situation, parsedRules, variable)
				: variable

		let cacheAndNode = (nodeValue, missingVariables) => {
			cache[cacheName] = rewriteNode(
				node,
				nodeValue,
				explanation,
				missingVariables
			)
			return cache[cacheName]
		}

		// SITUATION 1 : La variable est directement renseignée
		if (situationValue != null) return cacheAndNode(situationValue, {})

		// SITUATION 2 : La variable est calculée
		if (situationValue == null && variableHasFormula)
			return cacheAndNode(explanation.nodeValue, explanation.missingVariables)

		// SITUATION 3 : La variable est une question sans condition dont la valeur n'a pas été renseignée
		if (situationValue == null && !variableHasFormula && !variableHasCond)
			return cacheAndNode(null, { [dottedName]: 1 })

		// SITUATION 4 : La variable est une question avec conditions
		if (situationValue == null && !variableHasFormula && variableHasCond) {
			// SITUATION 4.1 : La condition est connue et vrai
			if (explanation.isApplicable)
				return cacheAndNode(explanation.nodeValue, { [dottedName]: 1 })

			// SITUATION 4.2 : La condition est connue et fausse
			if (explanation.isApplicable === false)
				return cacheAndNode(explanation.nodeValue, {})
			// SITUATION 4.3 : La condition n'est pas connue
			if (explanation.isApplicable == null)
				return cacheAndNode(null, explanation.missingVariables)
		}
	}

	let { fragments } = parseResult,
		variablePartialName = fragments.join(' . '),
		dottedName = disambiguateRuleReference(rules, rule, variablePartialName)

	return {
		evaluate,
		//eslint-disable-next-line react/display-name
		jsx: nodeValue => (
			<Leaf
				classes="variable filtered"
				filter={filter}
				name={fragments.join(' . ')}
				dottedName={dottedName}
				value={nodeValue}
			/>
		),

		name: variablePartialName,
		category: 'variable',
		fragments,
		dottedName,
		type: 'boolean | numeric'
	}
}

// TODO - this is becoming overly specific
export let treatFilteredVariable = (rules, rule) => parseResult => {
	let evaluateFiltered = originalEval => (
		cache,
		situation,
		parsedRules,
		node
	) => {
		let newSituation = name =>
			name == 'sys.filter' ? parseResult.filter : situation(name)
		return originalEval(cache, newSituation, parsedRules, node)
	}
	let node = treatVariable(rules, rule, parseResult.filter)(
			parseResult.variable
		),
		// Decorate node with the composante filter (either who is paying, either tax free)
		cotisation = {
			...node.cotisation,
			'dû par': parseResult.filter,
			'impôt sur le revenu': parseResult.filter
		}

	return {
		...node,
		cotisation,
		evaluate: evaluateFiltered(node.evaluate)
	}
}

export let treatNegatedVariable = variable => {
	let evaluate = (cache, situation, parsedRules, node) => {
		let explanation = evaluateNode(
				cache,
				situation,
				parsedRules,
				node.explanation
			),
			nodeValue = explanation.nodeValue == null ? null : !explanation.nodeValue,
			missingVariables = explanation.missingVariables

		return rewriteNode(node, nodeValue, explanation, missingVariables)
	}

	let jsx = (nodeValue, explanation) => (
		<Node
			classes="inlineExpression negation"
			value={nodeValue}
			child={
				<span className="nodeContent">
					<Trans i18nKey="inlineExpressionNegation">Non</Trans>{' '}
					{makeJsx(explanation)}
				</span>
			}
		/>
	)

	return {
		evaluate,
		jsx,
		category: 'mecanism',
		name: 'négation',
		type: 'boolean',
		explanation: variable
	}
}
