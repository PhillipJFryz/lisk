'use strict';

var node = require('../../../../node');
var shared = require('../../../shared');
var localShared = require('./shared');

describe('POST /api/transactions (type 7 on top of type 4)', function () {

	var scenarios = {
		'regular': new shared.MultisigScenario(),
	};

	var transaction, signature;
	var badTransactions = [];
	var goodTransactions = [];

	localShared.beforeValidationPhase(scenarios);

	describe('registering dapp', function () {

		it('regular scenario should be ok', function () {
			return localShared.sendAndSignMultisigTransaction('dapp', scenarios.regular)
				.then(function (transaction) {
					goodTransactions.push(transaction);
				});
		});
	});

	describe('confirmation', function () {

		shared.confirmationPhase(goodTransactions, badTransactions);
	});

	describe('sending outTransfer', function () {

		it('regular scenario should be ok', function () {
			return localShared.sendAndSignMultisigTransaction('outTransfer', scenarios.regular)
				.then(function (transaction) {
					goodTransactions.push(transaction);
				});
		});
	});

	describe('confirmation', function () {

		shared.confirmationPhase(goodTransactions, badTransactions);
	});
});
