'use strict';

var node = require('../../../node');
var genesisDelegates = require('../../../genesisDelegates.json');
var apiCodes = require('../../../../helpers/apiCodes');
var http = require('../../../common/httpCommunication');

var sendTransactionPromise = require('../../../common/apiHelpers').sendTransactionPromise;
var sendSignaturePromise = require('../../../common/apiHelpers').sendSignaturePromise;

describe('POST /api/transactions (type 4) with other transactions', function () {

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
