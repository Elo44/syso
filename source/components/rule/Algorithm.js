import { makeJsx } from 'Engine/evaluation'
import knownMecanisms from 'Engine/known-mecanisms.yaml'
import classNames from 'classnames'
import { path, values } from 'ramda'
import React from 'react'
import { Trans, translate } from 'react-i18next'
import { AttachDictionary } from '../AttachDictionary'
import './Algorithm.css'

// The showValues prop is passed as a context. It used to be delt in CSS (not(.showValues) display: none), both coexist right now
import { ShowValuesProvider } from './ShowValuesContext'

@AttachDictionary(knownMecanisms)
@translate()
export default class Algorithm extends React.Component {
	render() {
		let { rule, showValues } = this.props,
			ruleWithoutFormula =
				!rule['formule'] ||
				path(['formule', 'explanation', 'une possibilité'], rule)

		let conditionKeys = [
			'parentDependency',
			'applicable si',
			'non applicable si'
		]
		return (
			<div id="algorithm">
				<section id="rule-rules" className={classNames({ showValues })}>
					<ShowValuesProvider value={showValues}>
						<section id="declenchement">
							<h2>
								<Trans>Déclenchement</Trans>
							</h2>
							<ul>
								{conditionKeys.map(
									k => rule[k] && <li key={k}>{makeJsx(rule[k])}</li>
								)}
							</ul>
						</section>
						{!ruleWithoutFormula ? (
							<section id="formule">
								<h2>
									<Trans>Calcul</Trans>
								</h2>
								{makeJsx(rule['formule'])}
							</section>
						) : null}
					</ShowValuesProvider>
				</section>
			</div>
		)
	}
}
