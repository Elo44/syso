import PropTypes from 'prop-types'
import React, { Component } from 'react'

export default function withLanguage(WrappedComponent) {
	return class WithLanguage extends Component {
		static contextTypes = {
			i18n: PropTypes.object.isRequired
		}
		static displayName = `withLanguage(${Component.displayName ||
			Component.name})`
		render() {
			return (
				<WrappedComponent
					{...this.props}
					language={this.context.i18n.language + ''}
				/>
			)
		}
	}
}
