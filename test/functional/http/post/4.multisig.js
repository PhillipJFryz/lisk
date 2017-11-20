'use strict';

var node = require('../../../node');
var genesisDelegates = require('../../../genesisDelegates.json');
var shared = require('../../shared');
var apiCodes = require('../../../../helpers/apiCodes');
var constants = require('../../../../helpers/constants');
var http = require('../../../common/httpCommunication');

var sendTransactionPromise = require('../../../common/apiHelpers').sendTransactionPromise;
var sendSignaturePromise = require('../../../common/apiHelpers').sendSignaturePromise;
var waitForConfirmations = require('../../../common/apiHelpers').waitForConfirmations;

describe('POST /api/transactions (type 4) register multisignature', function () {

	var scenarios = {
		'no_funds': new shared.MultisigScenario(3, 0),
		'minimal_funds': new shared.MultisigScenario(3, constants.fees.multisignature * 3),
		'minimum_not_reached': new shared.MultisigScenario(4), // 4 members 2 min signatures required
		'regular': new shared.MultisigScenario(3), // 3 members 2 min signatures required
		'regular_with_second_signature': new shared.MultisigScenario(3), // 3 members 2 min signatures required
		'max_signatures': new shared.MultisigScenario(constants.multisigConstraints.keysgroup.maxItems + 1), // 16 members 2 min signatures required
		'max_signatures_max_min': new shared.MultisigScenario(constants.multisigConstraints.keysgroup.maxItems + 1), // 16 members 16 min signatures required
		'more_than_max_signatures': new shared.MultisigScenario(constants.multisigConstraints.keysgroup.maxItems + 2) // 17 members 2 min signatures required
	};

	var transaction, signature;
	var transactionsToWaitFor = [];
	var badTransactions = [];
	var goodTransactions = [];
	var badTransactionsEnforcement = [];
	var goodTransactionsEnforcement = [];
	var pendingMultisignatures = [];

	before(function () {
		//Crediting accounts
		return node.Promise.all(Object.keys(scenarios).map(function (type) {
			if (type === 'no_funds') {
				return;
			}

			var transaction = node.lisk.transaction.createTransaction(scenarios[type].account.address, scenarios[type].amount, node.gAccount.password);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('status').to.equal(200);
				transactionsToWaitFor.push(transaction.id);
			});
		})).then(function () {
			return waitForConfirmations(transactionsToWaitFor);
		});
	});

	describe('schema validations', function () {

		shared.invalidAssets('multisignature', badTransactions);

		describe('keysgroup', function () {

			it('using empty array should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, [], 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid transaction body - Failed to validate multisignature schema: Array is too short (0), minimum ' + constants.multisigConstraints.keysgroup.minItems);
					badTransactions.push(transaction);
				});
			});

			it('using empty member should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, ['+' + node.eAccount.publicKey, '+' + scenarios.no_funds.account.publicKey, '+' + scenarios.minimal_funds.account.publicKey, null], 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid member in keysgroup');
					badTransactions.push(transaction);
				});
			});

			it('including sender should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, ['+' + node.eAccount.publicKey, '+' + scenarios.regular.account.publicKey], 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid multisignature keysgroup. Can not contain sender');
					badTransactions.push(transaction);
				});
			});

			it('using same member twice should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, ['+' + node.eAccount.publicKey, '+' + node.eAccount.publicKey], 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Encountered duplicate public key in multisignature keysgroup');
					badTransactions.push(transaction);
				});
			});

			it('using invalid publicKey should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, ['+L' + node.eAccount.publicKey.slice(0, -1), '+' + scenarios.no_funds.account.publicKey], 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid public key in multisignature keysgroup');
					badTransactions.push(transaction);
				});
			});

			it('using no math operator (just publicKey) should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, [node.eAccount.publicKey, scenarios.no_funds.account.publicKey, scenarios.minimal_funds.account.publicKey], 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid math operator in multisignature keysgroup');
					badTransactions.push(transaction);
				});
			});

			it('just math operator should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, ['+', '+'], 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid public key in multisignature keysgroup');
					badTransactions.push(transaction);
				});
			});

			it('using invalid math operator should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, ['-' + node.eAccount.publicKey, '+' + scenarios.no_funds.account.publicKey], 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid math operator in multisignature keysgroup');
					badTransactions.push(transaction);
				});
			});

			it('using duplicated correct operator should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, ['++' + node.eAccount.publicKey, '+' + scenarios.no_funds.account.publicKey], 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid public key in multisignature keysgroup');
					badTransactions.push(transaction);
				});
			});

			it('using more_than_max_signatures scenario(' + (constants.multisigConstraints.keysgroup.maxItems + 2) + ',2) should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.more_than_max_signatures.account.password, null, scenarios.more_than_max_signatures.keysgroup, 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid transaction body - Failed to validate multisignature schema: Array is too long (' + (constants.multisigConstraints.keysgroup.maxItems + 1) + '), maximum ' + constants.multisigConstraints.keysgroup.maxItems);
					badTransactions.push(transaction);
				});
			});	
		});

		describe('min', function () {

			it('using bigger than keysgroup size plus 1 should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, [node.eAccount.publicKey], 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid multisignature min. Must be less than or equal to keysgroup size');
					badTransactions.push(transaction);
				});
			});

			it('using min greater than maximum(' + constants.multisigConstraints.min.maximum + ') should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.max_signatures_max_min.account.password, null, scenarios.max_signatures_max_min.keysgroup, 1, constants.multisigConstraints.min.maximum + 1);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid transaction body - Failed to validate multisignature schema: Value ' + (constants.multisigConstraints.min.maximum + 1) + ' is greater than maximum ' + constants.multisigConstraints.min.maximum);
					badTransactions.push(transaction);
				});
			});

			it('using min less than minimum(' + constants.multisigConstraints.min.minimum + ') should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.max_signatures.account.password, null, scenarios.max_signatures.keysgroup, 1, constants.multisigConstraints.min.minimum - 1);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid transaction body - Failed to validate multisignature schema: Value ' + (constants.multisigConstraints.min.minimum - 1) + ' is less than minimum ' + constants.multisigConstraints.min.minimum);
					badTransactions.push(transaction);
				});
			});
		});

		describe('lifetime', function () {

			it('using greater than maximum(' + constants.multisigConstraints.lifetime.maximum + ') should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, scenarios.regular.keysgroup, constants.multisigConstraints.lifetime.maximum + 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid transaction body - Failed to validate multisignature schema: Value ' + (constants.multisigConstraints.lifetime.maximum + 1) + ' is greater than maximum ' + constants.multisigConstraints.lifetime.maximum);
					badTransactions.push(transaction);
				});
			});

			it('using less than minimum(' + constants.multisigConstraints.lifetime.minimum + ') should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, scenarios.regular.keysgroup, constants.multisigConstraints.lifetime.minimum - 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Invalid transaction body - Failed to validate multisignature schema: Value ' + (constants.multisigConstraints.lifetime.minimum - 1) + ' is less than minimum ' + constants.multisigConstraints.lifetime.minimum);
					badTransactions.push(transaction);
				});
			});
		});
	});

	describe('transactions processing', function () {

		it('with no_funds scenario should fail', function () {
			transaction = node.lisk.multisignature.createMultisignature(scenarios.no_funds.account.password, null, scenarios.no_funds.keysgroup, 1, 2);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('status').to.equal(400);
				node.expect(res).to.have.nested.property('body.message').to.equal('Account does not have enough LSK: ' + scenarios.no_funds.account.address + ' balance: 0');
				badTransactions.push(transaction);
			});
		});

		it('with minimal_funds scenario should be ok', function () {
			transaction = node.lisk.multisignature.createMultisignature(scenarios.minimal_funds.account.password, null, scenarios.minimal_funds.keysgroup, 1, 2);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('status').to.equal(200);
				node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
				scenarios.minimal_funds.transaction = transaction;
			});
		});

		it('using valid params regular scenario (3,2) should be ok', function () {
			transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, scenarios.regular.keysgroup, 1, 2);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('status').to.equal(200);
				node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
				scenarios.regular.transaction = transaction;
			});
		});

		it('using valid params regular_with_second_signature scenario (3,2) should be ok', function () {
			transaction = node.lisk.multisignature.createMultisignature(scenarios.regular_with_second_signature.account.password, null, scenarios.regular_with_second_signature.keysgroup, 1, 2);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('status').to.equal(200);
				node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
				scenarios.regular_with_second_signature.transaction = transaction;
			});
		});

		it('using valid params minimum_not_reached scenario (4,2) should be ok', function () {
			transaction = node.lisk.multisignature.createMultisignature(scenarios.minimum_not_reached.account.password, null, scenarios.minimum_not_reached.keysgroup, 1, 2);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('status').to.equal(200);
				node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
				scenarios.minimum_not_reached.transaction = transaction;
			});
		});

		it('using valid params max_signatures scenario (16,2) should be ok', function () {
			transaction = node.lisk.multisignature.createMultisignature(scenarios.max_signatures.account.password, null, scenarios.max_signatures.keysgroup, 1, 2);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('status').to.equal(200);
				node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
				scenarios.max_signatures.transaction = transaction;
			});
		});

		it('using valid params max_signatures_max_min scenario (16,16) should be ok', function () {
			transaction = node.lisk.multisignature.createMultisignature(scenarios.max_signatures_max_min.account.password, null, scenarios.max_signatures_max_min.keysgroup, 1, 2);

			return sendTransactionPromise(transaction).then(function (res) {
				node.expect(res).to.have.property('status').to.equal(200);
				node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
				scenarios.max_signatures_max_min.transaction = transaction;
			});
		});

		describe('signing transactions', function () {

			it('with not all the signatures minimum_not_reached scenario (4,2) should be ok but never confirmed', function () {
				signature = node.lisk.multisignature.signTransaction(scenarios.minimum_not_reached.transaction, scenarios.minimum_not_reached.members[0].password);

				return sendSignaturePromise(signature, scenarios.minimum_not_reached.transaction).then(function (res) {
					node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
					node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
					pendingMultisignatures.push(scenarios.minimum_not_reached.transaction);
				});
			});

			it('twice with the same account should fail', function () {
				signature = node.lisk.multisignature.signTransaction(scenarios.minimum_not_reached.transaction, scenarios.minimum_not_reached.members[0].password);

				return sendSignaturePromise(signature, scenarios.minimum_not_reached.transaction).then(function (res) {
					node.expect(res).to.have.property('statusCode').to.equal(apiCodes.INTERNAL_SERVER_ERROR);
					node.expect(res).to.have.nested.property('body.message').to.equal('Error processing signature: Permission to sign transaction denied');
				});
			});

			it('with not requested account should fail', function () {
				signature = node.lisk.multisignature.signTransaction(scenarios.minimum_not_reached.transaction, node.randomAccount().password);

				return sendSignaturePromise(signature, scenarios.minimum_not_reached.transaction).then(function (res) {
					node.expect(res).to.have.property('statusCode').to.equal(apiCodes.INTERNAL_SERVER_ERROR);
					node.expect(res).to.have.nested.property('body.message').to.equal('Error processing signature: Failed to verify signature');
				});
			});

			it('with all the signatures regular scenario (3,2) should be ok and confirmed', function () {
				return node.Promise.all(node.Promise.map(scenarios.regular.members, function (member) {
					signature = node.lisk.multisignature.signTransaction(scenarios.regular.transaction, member.password);

					return sendSignaturePromise(signature, scenarios.regular.transaction).then(function (res) {
						node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
						node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
					});
				})).then(function () {
					goodTransactions.push(scenarios.regular.transaction);
				});
			});

			it('with all the signatures regular_with_second_signature scenario (3,2) should be ok and confirmed', function () {
				return node.Promise.all(node.Promise.map(scenarios.regular_with_second_signature.members, function (member) {
					signature = node.lisk.multisignature.signTransaction(scenarios.regular_with_second_signature.transaction, member.password);

					return sendSignaturePromise(signature, scenarios.regular_with_second_signature.transaction).then(function (res) {
						node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
						node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
					});
				})).then(function () {
					goodTransactions.push(scenarios.regular_with_second_signature.transaction);
				});
			});

			it('with all the signatures already in place regular scenario (3,2) should fail', function () {
				signature = node.lisk.multisignature.signTransaction(scenarios.regular.transaction, scenarios.regular.members[0].password);

				return sendSignaturePromise(signature, scenarios.regular.transaction).then(function (res) {
					node.expect(res).to.have.property('statusCode').to.equal(apiCodes.INTERNAL_SERVER_ERROR);
					node.expect(res).to.have.nested.property('body.message').to.equal('Error processing signature: Permission to sign transaction denied');
				});
			});

			it('with all the signatures max_signatures scenario (16,2) should be ok and confirmed', function () {
				return node.Promise.all(node.Promise.map(scenarios.max_signatures.members, function (member) {
					signature = node.lisk.multisignature.signTransaction(scenarios.max_signatures.transaction, member.password);

					return sendSignaturePromise(signature, scenarios.max_signatures.transaction).then(function (res) {
						node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
						node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
					});
				})).then(function () {
					goodTransactions.push(scenarios.max_signatures.transaction);
				});
			});

			it('with all the signatures max_signatures_max_min scenario (16,16) should be ok and confirmed', function () {
				return node.Promise.all(node.Promise.map(scenarios.max_signatures_max_min.members, function (member) {
					signature = node.lisk.multisignature.signTransaction(scenarios.max_signatures_max_min.transaction, member.password);

					return sendSignaturePromise(signature, scenarios.max_signatures_max_min.transaction).then(function (res) {
						node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
						node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
					});
				})).then(function () {
					goodTransactions.push(scenarios.max_signatures_max_min.transaction);
				});
			});
		});
	});

	describe('confirmation', function () {

		shared.confirmationPhase(goodTransactions, badTransactions, pendingMultisignatures);
	});

	describe('validation', function () {

		describe('type 0 - sending funds', function () {

			it('minimum_not_reached scenario(4,2) should be ok and confirmed without member signatures', function () {
				transaction = node.lisk.transaction.createTransaction(scenarios.regular.account.address, 1, scenarios.minimum_not_reached.account.password);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(200);
					node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
					goodTransactionsEnforcement.push(transaction);
				});
			});

			it('regular scenario(3,2) should be ok', function () {
				transaction = node.lisk.transaction.createTransaction(scenarios.max_signatures.account.address, 1, scenarios.regular.account.password);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(200);
					node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
					scenarios.regular.transaction = transaction;
				});
			});

			it('max_signatures scenario(16,2) should be ok but never confirmed without the minimum signatures', function () {
				transaction = node.lisk.transaction.createTransaction(scenarios.regular.account.address, 1, scenarios.max_signatures.account.password);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(200);
					node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
					pendingMultisignatures.push(transaction);
				});
			});

			it('max_signatures_max_min scenario(16,16) should be ok', function () {
				transaction = node.lisk.transaction.createTransaction(scenarios.regular.account.address, 1, scenarios.max_signatures_max_min.account.password);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(200);
					node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
					scenarios.max_signatures_max_min.transaction = transaction;
				});
			});

			describe('signing transactions', function () {

				it('with min required signatures regular scenario(3,2) should be ok and confirmed', function () {
					return node.Promise.all(node.Promise.map(scenarios.regular.members, function (member) {
						signature = node.lisk.multisignature.signTransaction(scenarios.regular.transaction, member.password);

						return sendSignaturePromise(signature, scenarios.regular.transaction).then(function (res) {
							node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
							node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
						});
					})).then(function () {
						goodTransactionsEnforcement.push(scenarios.regular.transaction);
					});
				});

				it('with min required signatures max_signatures_max_min scenario(16,16) should be ok and confirmed', function () {
					return node.Promise.all(node.Promise.map(scenarios.max_signatures_max_min.members, function (member) {
						signature = node.lisk.multisignature.signTransaction(scenarios.max_signatures_max_min.transaction, member.password);

						return sendSignaturePromise(signature, scenarios.max_signatures_max_min.transaction).then(function (res) {
							node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
							node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
						});
					})).then(function () {
						goodTransactionsEnforcement.push(scenarios.max_signatures_max_min.transaction);
					});
				});
			});
		});

		describe('type 1 - second secret', function () {

			it('regular_with_second_signature scenario(3,2) should be ok', function () {
				transaction = node.lisk.signature.createSignature(scenarios.regular_with_second_signature.account.password, scenarios.regular_with_second_signature.account.secondPassword);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(200);
					node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
					scenarios.regular_with_second_signature.transaction = transaction;
				});
			});

			describe('signing transactions', function () {

				it('with min required signatures regular_with_second_signature scenario(3,2) should be ok and confirmed', function () {
					return node.Promise.all(node.Promise.map(scenarios.regular_with_second_signature.members, function (member) {
						signature = node.lisk.multisignature.signTransaction(scenarios.regular_with_second_signature.transaction, member.password);

						return sendSignaturePromise(signature, scenarios.regular_with_second_signature.transaction).then(function (res) {
							node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
							node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
						});
					})).then(function () {
						goodTransactionsEnforcement.push(scenarios.regular_with_second_signature.transaction);
					});
				});
			});
		});

		describe('type 2 - registering delegate', function () {

			it('regular scenario(3,2) should be ok', function () {
				transaction = node.lisk.delegate.createDelegate(scenarios.regular.account.password, scenarios.regular.account.username);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(200);
					node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
					scenarios.regular.transaction = transaction;
				});
			});

			describe('signing transactions', function () {

				it('with min required signatures regular scenario(3,2) should be ok and confirmed', function () {
					return node.Promise.all(node.Promise.map(scenarios.regular.members, function (member) {
						signature = node.lisk.multisignature.signTransaction(scenarios.regular.transaction, member.password);

						return sendSignaturePromise(signature, scenarios.regular.transaction).then(function (res) {
							node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
							node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
						});
					})).then(function (res) {
						goodTransactionsEnforcement.push(scenarios.regular.transaction);
					});
				});
			});
		});

		describe('type 3 - voting delegate', function () {

			it('regular scenario(3,2) should be ok', function () {
				transaction = node.lisk.vote.createVote(scenarios.regular.account.password, ['+' + node.eAccount.publicKey]);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(200);
					node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
					scenarios.regular.transaction = transaction;
				});
			});

			describe('signing transactions', function () {

				it('with min required signatures regular scenario(3,2) should be ok and confirmed', function () {
					return node.Promise.all(node.Promise.map(scenarios.regular.members, function (member) {
						signature = node.lisk.multisignature.signTransaction(scenarios.regular.transaction, member.password);

						return sendSignaturePromise(signature, scenarios.regular.transaction).then(function (res) {
							node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
							node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
						});
					})).then(function () {
						goodTransactionsEnforcement.push(scenarios.regular.transaction);
					});
				});
			});
		});

		describe('type 4 - registering multisignature account', function () {

			it('with an account already registered should fail', function () {
				transaction = node.lisk.multisignature.createMultisignature(scenarios.regular.account.password, null, scenarios.regular.keysgroup, 1, 2);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(400);
					node.expect(res).to.have.nested.property('body.message').to.equal('Account already has multisignatures enabled');
					badTransactionsEnforcement.push(transaction);
				});
			});
		});

		describe('type 5 - registering dapp', function () {

			it('regular scenario(3,2) should be ok', function () {
				transaction = node.lisk.dapp.createDapp(scenarios.regular.account.password, null, node.randomApplication());

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(200);
					node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
					scenarios.regular.transaction = transaction;
				});
			});

			describe('signing transactions', function () {

				it('with min required signatures regular scenario(3,2) should be ok and confirmed', function () {
					return node.Promise.all(node.Promise.map(scenarios.regular.members, function (member) {
						signature = node.lisk.multisignature.signTransaction(scenarios.regular.transaction, member.password);

						return sendSignaturePromise(signature, scenarios.regular.transaction).then(function (res) {
							node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
							node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
						});
					})).then(function () {
						goodTransactionsEnforcement.push(scenarios.regular.transaction);
					});
				});
			});
		});

		describe('type 6 - inTransfer', function () {
			
			var dapp6 = node.randomApplication();

			before(function () {
				transaction = node.lisk.dapp.createDapp(scenarios.regular.account.password, null, dapp6);

				return sendTransactionPromise(transaction)
					.then(function (res) {
						node.expect(res).to.have.property('status').to.equal(200);
						node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
						goodTransactionsEnforcement.push(transaction);
						dapp6.transactionId = transaction.id;
						
						return node.Promise.all(node.Promise.map(scenarios.regular.members, function (member) {
							signature = node.lisk.multisignature.signTransaction(transaction, member.password);

							return sendSignaturePromise(signature, transaction).then(function (res) {
								node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
								node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
							});
						}));
					})
					.then(function () {
						goodTransactionsEnforcement.push(transaction);
						
						return waitForConfirmations([dapp6.transactionId]);
					});
			});

			it('regular scenario(3,2) should be ok', function () {
				transaction = node.lisk.transfer.createInTransfer(dapp6.transactionId, 10 * node.normalizer, scenarios.regular.account.password);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(200);
					node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
					scenarios.regular.transaction = transaction;
				});
			});

			describe('signing transactions', function () {

				it('with min required signatures regular scenario(3,2) should be ok and confirmed', function () {
					return node.Promise.all(node.Promise.map(scenarios.regular.members, function (member) {
						signature = node.lisk.multisignature.signTransaction(scenarios.regular.transaction, member.password);

						return sendSignaturePromise(signature, scenarios.regular.transaction).then(function (res) {
							node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
							node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
						});
					})).then(function () {
						goodTransactionsEnforcement.push(scenarios.regular.transaction);
					});
				});
			});
		});
		
		describe('type 7 - outTransfer', function () {

			var dapp7 = node.randomApplication();

			before(function () {
				transaction = node.lisk.dapp.createDapp(scenarios.regular.account.password, null, dapp7);

				return sendTransactionPromise(transaction)
					.then(function (res) {
						node.expect(res).to.have.property('status').to.equal(200);
						node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
						goodTransactionsEnforcement.push(transaction);
						dapp7.transactionId = transaction.id;

						return node.Promise.all(node.Promise.map(scenarios.regular.members, function (member) {
							signature = node.lisk.multisignature.signTransaction(transaction, member.password);

							return sendSignaturePromise(signature, transaction).then(function (res) {
								node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
								node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
							});
						}));
					})
					.then(function () {
						goodTransactionsEnforcement.push(transaction);

						return waitForConfirmations([dapp7.transactionId]);
					});
			});

			it('regular scenario(3,2) should be ok', function () {
				transaction = node.lisk.transfer.createOutTransfer(dapp7.transactionId, node.randomTransaction().id, node.randomAccount().address, 10 * node.normalizer, scenarios.regular.account.password);

				return sendTransactionPromise(transaction).then(function (res) {
					node.expect(res).to.have.property('status').to.equal(200);
					node.expect(res).to.have.nested.property('body.status').to.equal('Transaction(s) accepted');
					scenarios.regular.transaction = transaction;
				});
			});

			describe('signing transactions', function () {

				it('with min required signatures regular scenario(3,2) should be ok and confirmed', function () {
					return node.Promise.all(node.Promise.map(scenarios.regular.members, function (member) {
						signature = node.lisk.multisignature.signTransaction(scenarios.regular.transaction, member.password);

						return sendSignaturePromise(signature, scenarios.regular.transaction).then(function (res) {
							node.expect(res).to.have.property('statusCode').to.equal(apiCodes.OK);
							node.expect(res).to.have.nested.property('body.status').to.equal('Signature Accepted');
						});
					})).then(function () {
						goodTransactionsEnforcement.push(scenarios.regular.transaction);
					});
				});
			});
		});
	});

	describe('confirm validation', function () {

		shared.confirmationPhase(goodTransactionsEnforcement, badTransactionsEnforcement, pendingMultisignatures);
	});

	describe('multisignature with other transactions', function () {

		function getTransactionById (id, cb) {
			var params = 'id=' + id;
			http.get('/api/transactions/?' + params, cb);
		}

		function postTransaction (transaction, cb) {
			if (!transaction) {
				console.trace();
			}
			sendTransactionPromise(transaction)
				.then(function (res) {
					node.expect(res).to.have.property('statusCode').equal(apiCodes.OK);
					cb(null, transaction);
				})
				.catch(function (error) {
					node.expect(error).not.to.exist;
					cb(error);
				});
		}

		function confirmMultisigTransaction (transaction, passphrases, cb) {
			var count = 0;
			node.async.until(function () {
				return (count >= passphrases.length);
			}, function (untilCb) {
				postSignature({secret: passphrases[count], transaction: transaction}, function (err, res) {
					if (err) {
						untilCb(err);
					}
					node.expect(res).be.a('string');
					count++;
					return untilCb();
				});
			}, cb);
		}

		function postSignature (params, cb) {
			var signature = node.lisk.multisignature.signTransaction(params.transaction, params.secret, params.secondSecret);
			sendSignaturePromise(signature, params.transaction)
				.then(function (res) {
					node.expect(res).to.have.property('statusCode').equal(apiCodes.OK);
					cb(null, signature);
				})
				.catch(cb);
		}

		function createAccountWithLisk (params, cb) {
			postTransfer(params, node.onNewBlock.bind(null, cb));
		}

		function postTransfer (params, cb) {
			postTransaction(node.lisk.transaction.createTransaction(params.recipientId, params.amount, params.secret || node.gAccount.password), cb);
		}

		function postSecondSignature (params, cb) {
			postTransaction(node.lisk.signature.createSignature(params.secret, params.secondSecret), cb);
		}

		function postDelegates (params, cb) {
			postTransaction(node.lisk.delegate.createDelegate(params.secret, params.username), cb);
		}

		function postVote (params, cb) {
			postTransaction(node.lisk.vote.createVote(params.secret, params.delegates), cb);
		}

		function createDapp (params, cb) {
			postTransaction(node.lisk.dapp.createDapp(params.account.password, null, {
				secret: params.account.password,
				category: node.randomProperty(node.dappCategories),
				name: params.applicationName,
				type: node.dappTypes.DAPP,
				description: 'A dapp added via API autotest',
				tags: 'handy dizzy pear airplane alike wonder nifty curve young probable tart concentrate',
				link: 'https://github.com/' + params.applicationName + '/master.zip',
				icon: node.guestbookDapp.icon
			}), cb);
		}

		function createIntransfer (params, cb) {
			postTransaction(node.lisk.transfer.createInTransfer(params.dappId, params.amount, params.secret), cb);
		}

		function createOutTransfer (params, cb) {
			postTransaction(node.lisk.transfer.createOutTransfer(params.dappId, params.transactionId, params.recipientId, params.amount, params.secret), cb);
		}

		function checkConfirmedTransactions (ids, cb) {
			node.async.each(ids, function (id, eachCb) {
				getTransactionById(id, function (err, res) {
					node.expect(res).to.have.property('statusCode').equal(200);
					node.expect(res).to.have.nested.property('body.transactions.0.id').equal(id);
					node.expect(res.body.transactions).to.have.lengthOf(1);
					eachCb(err);
				});
			}, cb);
		}

		function createMultisignatureAndConfirm (account, cb) {
			var totalMembers = 15;
			var requiredSignatures = 15;
			var passphrases;
			var accounts = [];
			var keysgroup = [];
			for (var i = 0; i < totalMembers; i++) {
				accounts[i] = node.randomAccount();
				var member = '+' + accounts[i].publicKey;
				keysgroup.push(member);
			}
			passphrases = accounts.map(function (account) {
				return account.password;
			});
			var params = {
				secret: account.password,
				lifetime: parseInt(node.randomNumber(1,72)),
				min: requiredSignatures,
				keysgroup: keysgroup
			};
			var transaction = node.lisk.multisignature.createMultisignature(params.secret, null, params.keysgroup, params.lifetime, params.min);
			postTransaction(transaction, function () {
				confirmMultisigTransaction(transaction, passphrases, function (err) {
					if (err) { cb(err); }
					cb(err, transaction);
				});
			});
		}

		describe('for an account with lisk', function () {

			var multisigAccount;
			var amounts = [100000000*10, 100000000*12, 100000000*11];

			beforeEach(function (done) {
				multisigAccount = node.randomAccount();
				createAccountWithLisk({
					recipientId: multisigAccount.address,
					amount: 100000000*1000
				}, done);
			});

			describe('for multisignature transaction in the same block', function () {

				var multisigTransaction;

				beforeEach(function (done) {
					createMultisignatureAndConfirm(multisigAccount, function (err, transaction) {
						if (err) { done(err); }
						multisigTransaction = transaction;
						done();
					});
				});

				describe('with one type 0', function () {

					var transactionInCheckId;

					beforeEach(function (done) {
						postTransfer({
							recipientId: node.randomAccount().address,
							amount: 10,
							secret: multisigAccount.password
						}, function (err, transaction) {
							transactionInCheckId = transaction.id;
							node.onNewBlock(done);
						});
					});

					it('should confirm transaction', function (done) {
						checkConfirmedTransactions([transactionInCheckId, multisigTransaction.id], done);
					});
				});

				describe('with multiple type 0', function () {

					var transactionsToCheckIds;

					beforeEach(function (done) {
						node.async.map([node.randomAccount(), node.randomAccount(), node.randomAccount()], function (account, cb) {
							postTransfer({
								recipientId: node.randomAccount().address,
								amount: 10,
								secret: multisigAccount.password
							}, cb);
						}, function (err, results) {
							if (err) { done(err); }
							transactionsToCheckIds = results.map(function (transaction) {
								return transaction.id;
							});
							transactionsToCheckIds.push(multisigTransaction.id);
							node.onNewBlock(done);
						});
					});

					it('should confirm transaction', function (done) {
						checkConfirmedTransactions(transactionsToCheckIds, done);
					});
				});

				describe('with one type 1', function () {

					var transactionInCheckId;

					beforeEach(function (done) {
						var params = {
							secret: multisigAccount.password,
							secondSecret: multisigAccount.secondPassword
						};
						postSecondSignature(params, function (err, transaction) {
							transactionInCheckId = transaction.id;
							node.onNewBlock(done);
						});
					});

					it('should confirm transaction', function (done) {
						checkConfirmedTransactions([transactionInCheckId, multisigTransaction.id], done);
					});
				});

				describe('with one type 2', function () {

					var transactionInCheckId;

					beforeEach(function (done) {
						var params = {
							secret: multisigAccount.password,
							username: multisigAccount.username
						};

						postDelegates(params, function (err, transaction) {
							transactionInCheckId = transaction.id;
							node.onNewBlock(done);
						});
					});

					it('should confirm transaction', function (done) {
						checkConfirmedTransactions([transactionInCheckId, multisigTransaction.id], done);
					});
				});

				describe('with one type 3', function () {

					var transactionInCheckId;

					beforeEach(function (done) {
						postVote({
							secret: multisigAccount.password,
							delegates: ['+' + node.eAccount.publicKey]
						}, function (err, transaction) {
							transactionInCheckId = transaction.id;
							node.onNewBlock(done);
						});
					});

					it('should confirm transaction', function (done) {
						checkConfirmedTransactions([transactionInCheckId, multisigTransaction.id], done);
					});
				});

				describe('with multiple type 3', function () {

					var transactionsToCheckIds;

					beforeEach(function (done) {

						node.async.map([genesisDelegates.delegates[0], genesisDelegates.delegates[1], genesisDelegates.delegates[2]], function (delegate, cb) {
							postVote({
								secret: multisigAccount.password,
								delegates: ['+' + delegate.publicKey]
							}, cb);
						}, function (err, results) {
							if (err) { done(err); }
							transactionsToCheckIds = results.map(function (transaction) {
								return transaction.id;
							});
							transactionsToCheckIds.push(multisigTransaction.id);
							node.onNewBlock(done);
						});
					});

					it('should confirm transactions', function (done) {
						checkConfirmedTransactions(transactionsToCheckIds, done);
					});
				});

				describe('with one type 4', function () {

					var transactionInCheckId;

					beforeEach(function (done) {
						createMultisignatureAndConfirm(multisigAccount, function (err, transaction) {
							if (err) { done(err); }
							transactionInCheckId = transaction.id;
							node.onNewBlock(done);
						});
					});

					// TODO: This test should be updated after introducing determinism in the order of multisignature transaction confirmations
					it('should confirm one of the transaction', function (done) {
						node.async.map([transactionInCheckId, multisigTransaction.id], function (id, mapCb) {
							getTransactionById(id, mapCb);
						}, function (err, results) {
							if (err) { done(err); }
							var statusCodes = [];
							results.map(function (response) {
								statusCodes.push(response.statusCode);
							});
							node.expect(statusCodes).to.include(200, 204);
							done();
						});
					});
				});

				describe('with one type 5', function () {

					var transactionInCheckId;

					beforeEach(function (done) {
						var applicationName = node.randomApplicationName();
						createDapp({
							account: multisigAccount,
							applicationName: applicationName
						}, function (err, transaction) {
							transactionInCheckId = transaction.id;
							node.onNewBlock(done);
						});
					});

					it('should confirm transaction', function (done) {
						checkConfirmedTransactions([transactionInCheckId, multisigTransaction.id], done);
					});
				});

				describe('with multiple type 5', function () {

					var transactionsToCheckIds;

					beforeEach(function (done) {
						node.async.map([node.randomApplicationName(), node.randomApplicationName(), node.randomApplicationName()], function (applicationName, cb) {
							createDapp({
								account: multisigAccount,
								applicationName: applicationName
							}, cb);
						}, function (err, results) {
							if (err) { done(err); }
							transactionsToCheckIds = results.map(function (transaction) {
								return transaction.id;
							});
							transactionsToCheckIds.push(multisigTransaction.id);
							node.onNewBlock(done);
						});
					});

					it('should confirm transactions', function (done) {
						checkConfirmedTransactions(transactionsToCheckIds, done);
					});
				});
			});

			describe('when dapp is already registered', function () {

				var dappId;

				beforeEach(function (done) {
					var applicationName = node.randomApplicationName();
					createDapp({
						account: multisigAccount,
						applicationName: applicationName
					}, function (err, transaction) {
						dappId = transaction.id;
						node.onNewBlock(done);
					});
				});

				describe('for multisignature transaction in the same block', function () {

					var multisigTransaction;

					beforeEach(function (done) {
						createMultisignatureAndConfirm(multisigAccount, function (err, transaction) {
							if (err) { done(err); }
							multisigTransaction = transaction;
							done();
						});
					});

					describe('with one type 6', function () {

						var transactionInCheckId;

						beforeEach(function (done) {
							var params = {
								secret: multisigAccount.password,
								dappId: dappId,
								amount: 100000000*10
							};
							createIntransfer(params, function (err, transaction) {
								transactionInCheckId = transaction.id;
								node.onNewBlock(done);
							});
						});

						it('should confirm transaction', function (done) {
							checkConfirmedTransactions([transactionInCheckId, multisigTransaction.id], done);
						});
					});

					describe('with multiple type 6', function () {

						var transactionsToCheckIds;

						beforeEach(function (done) {
							node.async.map(amounts, function (amount, cb) {
								var params = {
									secret: multisigAccount.password,
									dappId: dappId,
									amount: amount
								};
								createIntransfer(params, cb);
							}, function (err, results) {
								if (err) { done(err); }
								transactionsToCheckIds = results.map(function (transaction) {
									return transaction.id;
								});
								transactionsToCheckIds.push(multisigTransaction.id);
								node.onNewBlock(done);
							});
						});

						it('should confirm transaction', function (done) {
							checkConfirmedTransactions(transactionsToCheckIds, done);
						});
					});
				});

				describe('when multiple inTransfer are already transaction made', function () {

					var inTransferId;
					var inTransferIds;

					beforeEach(function (done) {
						node.async.map(amounts, function (amount, cb) {
							var params = {
								secret: multisigAccount.password,
								dappId: dappId,
								amount: amount
							};
							createIntransfer(params, cb);
						}, function (err, results) {
							if (err) { done(err); }
							var transactionIds = results.map(function (transaction) {
								return transaction.id;
							});
							inTransferId = transactionIds[0];
							inTransferIds = transactionIds;
							node.onNewBlock(done);
						});
					});

					describe('for multisignature transaction in the same block', function () {

						var multisigTransaction;

						beforeEach(function (done) {
							createMultisignatureAndConfirm(multisigAccount, function (err, transaction) {
								if (err) { done(err); }
								multisigTransaction = transaction;
								done();
							});
						});

						describe('with one type 7 transaction', function () {

							var transactionInCheckId;

							beforeEach(function (done) {
								var outTransferParams = {
									amount: 1000,
									recipientId: '16313739661670634666L',
									dappId: dappId,
									transactionId: inTransferId,
									secret: multisigAccount.password
								};
								createOutTransfer(outTransferParams, function (err, transaction) {
									transactionInCheckId = transaction.id;
									node.onNewBlock(done);
								});
							});

							it('should confirmed transaction', function (done) {
								checkConfirmedTransactions([transactionInCheckId, multisigTransaction.id], done);
							});
						});

						describe('with multiple type 7', function () {

							var transactionsToCheckIds;

							beforeEach(function (done) {
								node.async.map(amounts, function (amount, cb) {
									var outTransferParams = {
										amount: 1000,
										recipientId: '16313739661670634666L',
										dappId: dappId,
										transactionId: inTransferIds[amounts.indexOf(amount)],
										secret: multisigAccount.password
									};
									createOutTransfer(outTransferParams, cb);
								}, function (err, results) {
									if (err) { done(err); }
									transactionsToCheckIds = results.map(function (transaction) {
										return transaction.id;
									});
									transactionsToCheckIds.push(multisigTransaction.id);
									node.onNewBlock(done);
								});
							});

							it('should confirm transaction', function (done) {
								checkConfirmedTransactions(transactionsToCheckIds, done);
							});
						});

						describe('with all transaction types together', function () {

							var transactionsToCheckIds;

							beforeEach(function (done) {
								node.async.parallel([
									function type0 (cb) {
										var params = {
											secret: multisigAccount.password,
											recipientId: node.randomAccount().address,
											amount: 100
										};
										postTransfer(params, cb);
									},
									function type1 (cb) {
										var params = {
											secret: multisigAccount.password,
											secondSecret: multisigAccount.secondPassword,
											transaction: multisigTransaction
										};
										postSecondSignature(params, cb);
									},
									function type2 (cb) {
										var params = {
											secret: multisigAccount.password,
											username: multisigAccount.username
										};
										postDelegates(params, cb);
									},
									function type3 (cb) {
										var params = {
											secret: multisigAccount.password,
											delegates: ['+' + node.eAccount.publicKey]
										};
										postVote(params, cb);
									},
									function type5 (cb) {
										var applicationName = node.randomApplicationName();
										createDapp({
											account: multisigAccount,
											applicationName: applicationName
										}, cb);
									},
									function type6 (cb) {
										var params = {
											secret: multisigAccount.password,
											dappId: dappId,
											amount: 10000
										};
										createIntransfer(params, cb);
									},
									function type7 (cb) {
										var outTransferParams = {
											amount: 10000,
											recipientId: '16313739661670634666L',
											dappId: dappId,
											transactionId: inTransferId,
											secret: multisigAccount.password
										};
										createOutTransfer(outTransferParams, cb);
									}
								], function (err, result) {
									if (err) { done(err); }
									transactionsToCheckIds = result.map(function (transaction) {
										return transaction.id;
									});
									transactionsToCheckIds.push(multisigTransaction.id);
									node.onNewBlock(done);
								});
							});

							it('should save all transactions in the block', function (done) {
								checkConfirmedTransactions(transactionsToCheckIds, done);
							});
						});
					});
				});
			});
		});
	});
});
