import OperationSimulator from "./OperationSimulator.js";
import {Resilient, RetryPolicy, Backoff, CircuitBreaker, CircuitState, OpenCircuitError, TimeoutError} from "./Resilient.js";
import test from "ava";

test("Execute with Success (No Result)", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 0;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	let entered = false;
	let failed = false;
	let succeeded = false;
	let exited = false;
	const resilient = new Resilient()
		.ifFailure(context => failed = true)
		.ifSuccess(context => succeeded = true)
		.whenEntering(context => entered = true)
		.whenExiting(context => exited = true);

	// Act
	await resilient.execute(intentionalMisinformation);

	// Assert
	t.true(entered);
	t.false(failed);
	t.true(succeeded);
	t.true(exited);
	t.is(resilient.executionContext.attempts, FAILURES_TO_SIMULATE + 1);
	t.true(resilient.executionContext.correlationId != null);
	t.true(resilient.executionContext.elapsedTime > 0);
	t.is(resilient.executionContext.exceptions.length, FAILURES_TO_SIMULATE);
	t.true(resilient.executionContext.startTime < Date.now());
});

test("Execute with Success (Result)", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 2;
	const CRAPS = 7;
	const SUCCESS = 3;
	let aborted = false;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(SUCCESS, CRAPS, FAILURES_TO_SIMULATE, TypeError, FAILURES_TO_SIMULATE);
	const resilient = new Resilient();
	const retryPolicy = new RetryPolicy()
		.retryIf(CRAPS)
		.stopAfter(5);

	// Act
	let result = await resilient
		.retryWith(retryPolicy)
		.execute(intentionalMisinformation);

	// Assert
	t.is(result, SUCCESS);
});

test("Execute with Failure", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 1;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	let entered = false;
	let failed = false;
	let succeeded = false;
	let exited = false;
	const resilient = new Resilient()
		.ifFailure(context => failed = true)
		.ifSuccess(context => succeeded = true)
		.whenEntering(context => entered = true)
		.whenExiting(context => exited = true);

	// Act
	await resilient.execute(intentionalMisinformation);

	// Assert
	t.true(entered);
	t.true(failed);
	t.false(succeeded);
	t.true(exited);
	t.is(resilient.executionContext.attempts, FAILURES_TO_SIMULATE);
	t.true(resilient.executionContext.correlationId != null);
	t.true(resilient.executionContext.elapsedTime > 0);
	t.is(resilient.executionContext.exceptions.length, FAILURES_TO_SIMULATE);
	t.true(resilient.executionContext.startTime < Date.now());
});

test("Execute with Retry Policy", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 2;
	let retries = 0;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	const resilient = new Resilient();
	const retryPolicy = new RetryPolicy()
		.ifRetry(context => retries++)
		.stopAfter(3);

	// Act
	await resilient
		.retryWith(retryPolicy)
		.execute(intentionalMisinformation);

	// Assert
	t.is(retries, FAILURES_TO_SIMULATE);
	t.is(resilient.executionContext.attempts, FAILURES_TO_SIMULATE + 1);
	t.is(resilient.executionContext.exceptions.length, FAILURES_TO_SIMULATE);
});

test("Execute with Retry Policy Fails", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 4;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	const resilient = new Resilient();
	const retryPolicy = new RetryPolicy()
		.stopAfter(3);

	// Act
	await resilient
		.retryWith(retryPolicy)
		.execute(intentionalMisinformation);

	// Assert 
	t.is(3, resilient.executionContext.attempts);
	t.is(3, resilient.executionContext.exceptions.length);
});

test("Execute with Retry Policy (More Attempts)", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 4;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	const resilient = new Resilient();
	const retryPolicy = new RetryPolicy()
		.stopAfter(5);

	// Act
	await resilient
		.retryWith(retryPolicy)
		.execute(intentionalMisinformation);

	// Assert 
	t.is(5, resilient.executionContext.attempts);
});

test("Execute with Retry Policy (Conditional)", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 3;
	const SNAKE_EYES = 2;
	const CRAPS = 7;
	const SUCCESS = Math.floor(Math.random() * 12) + 1;
	let aborted = false;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(CRAPS, SNAKE_EYES, FAILURES_TO_SIMULATE);
	const resilient = new Resilient();
	const retryPolicy = new RetryPolicy()
		.abortIf(CRAPS)
		.ifAbort(context => aborted = true)
		.retryIf(SNAKE_EYES)
		.stopAfter(5);

	// Act
	let result = await resilient
		.retryWith(retryPolicy)
		.execute(intentionalMisinformation);

	// Assert
	t.is(result, undefined);
	t.true(aborted);
	t.is(resilient.executionContext.attempts, FAILURES_TO_SIMULATE + 1);
});

test("Execute with Backoff (Exponential)", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 2;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	const resilient = new Resilient();
	const retryPolicy = new RetryPolicy()
		.delayBetweenRetries(5000)
		.stopAfter(3)
		.useBackOff(Backoff.Exponential);

	// Act
	const startTime = Date.now();
	await resilient
		.retryWith(retryPolicy)
		.execute(intentionalMisinformation);

	const endTime = Date.now();

	// Assert
	t.is(3, resilient.executionContext.attempts);
	t.true(endTime - startTime > 20000);
});

test("Execute With Backoff (Linear)", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 2;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	const resilient = new Resilient();
	const retryPolicy = new RetryPolicy()
		.delayBetweenRetries(3000)
		.stopAfter(3)
		.useBackOff(Backoff.Linear);

	// Act
	const startTime = Date.now();
	await resilient
		.retryWith(retryPolicy)
		.execute(intentionalMisinformation);
	const endTime = Date.now();

	// Assert
	t.is(3, resilient.executionContext.attempts);
	t.true(endTime - startTime > 9000);
});

test("Execute with Backoff (Random)", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 2;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	const resilient = new Resilient();
	const retryPolicy = new RetryPolicy()
		.delayBetweenRetries(3000)
		.stopAfter(3)
		.useBackOff(Backoff.Linear);

	// Act
	const startTime = Date.now();
	await resilient
		.retryWith(retryPolicy)
		.execute(intentionalMisinformation);

	const endTime = Date.now();

	// Assert
	t.is(3, resilient.executionContext.attempts);
});

test("Execute with Backoff (Static)", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 2;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	const resilient = new Resilient();
	const retryPolicy = new RetryPolicy()
		.delayBetweenRetries(3000)
		.stopAfter(3)
		.useBackOff(Backoff.Static);

	// Act
	const startTime = Date.now();
	await resilient
		.retryWith(retryPolicy)
		.execute(intentionalMisinformation);

	const endTime = Date.now();

	// Assert
	t.is(3, resilient.executionContext.attempts);
	t.true(endTime - startTime > 6000);
});

test("Execute with Circuit Breaker & Retry Policy", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 4;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	let fromStates = [];
	let toStates = [];
	const resilient = new Resilient();
	const retryPolicy = new RetryPolicy()
		.stopAfter(5)
		.delayBetweenRetries(1000)
		.useBackOff(Backoff.Static);
	let circuitBreaker = new CircuitBreaker()
		.ifTripped((from, to) =>
		{
			fromStates.push(from);
			toStates.push(to);
		})
		.openCircuitAfter(3)
		.resetAfter(10000);
	let startTime = Date.now();

	// Act
	await resilient
		.retryWith(retryPolicy)
		.shortCircuitWith(circuitBreaker)
		.execute(intentionalMisinformation);

	// Assert
	t.is(resilient.executionContext.attempts, FAILURES_TO_SIMULATE + 1);
	t.is(circuitBreaker.state, CircuitState.Closed);
});

test("Execute with Circuit Breaker & Retry Policy Fails", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 5;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	let failed = false;
	let succeeded = false;
	let fromStates = [];
	let toStates = [];
	const resilient = new Resilient();
	const retryPolicy = new RetryPolicy()
		.stopAfter(5)
		.delayBetweenRetries(1000)
		.useBackOff(Backoff.Static);
	let circuitBreaker = new CircuitBreaker()
		.ifTripped((from, to) =>
		{
			fromStates.push(from);
			toStates.push(to);
		})
		.openCircuitAfter(3)
		.resetAfter(5000);
	let startTime = Date.now();
	resilient
		.ifFailure(context => failed = true)
		.ifSuccess(context => succeeded = true)
		.retryWith(retryPolicy)
		.shortCircuitWith(circuitBreaker)

	// Act
	await resilient.execute(intentionalMisinformation);

	// Assert
	t.true(failed);
	t.false(succeeded);
	t.is(fromStates[0], CircuitState.Closed);
	t.is(fromStates[1], CircuitState.Open);
	t.is(toStates[0], CircuitState.Open);
	t.is(toStates[1], CircuitState.HalfOpen);
});

test("Execute with Fallback", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 1;

	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE);
	const resilient = new Resilient();
	let fellback = false;
	let executionFailed = false;

	// Act
	await resilient
		.fallbackTo(() => fellback = true)
		.ifFallback(context => executionFailed = true)
		.execute(intentionalMisinformation);

	// Assert
	t.true(fellback);
	t.true(executionFailed);
});

test("Execute with Fallback Result", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 1;
	const SIMULATION_RESULT = 0;
	const FAILURE_RESULT = -1;
	const FALLBACK_RESULT = 1;

	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(SIMULATION_RESULT, FAILURE_RESULT, 0, Error, FAILURES_TO_SIMULATE);
	const resilient = new Resilient();

	// Act
	let result = await resilient
		.fallbackTo(() => FALLBACK_RESULT)
		.execute(intentionalMisinformation);

	// Assert
	t.is(result, FALLBACK_RESULT);
});

test("Execute with Timeout", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 0;
	const EXECUTION_TIME = 15000;
	const TIMEOUT = 20000;
	let timedOut = false;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, FAILURES_TO_SIMULATE, Error, FAILURES_TO_SIMULATE, EXECUTION_TIME);
	const resilient = new Resilient()
		.timeoutAfter(TIMEOUT)
		.ifTimeout(context => timedOut = true);

	// Act
	await resilient.execute(intentionalMisinformation);

	// Assert
	t.false(timedOut);
});

test("Execute with Timeout Times Out", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 0;
	const EXECUTION_TIME = 20000;
	const TIMEOUT = 15000;
	let timedOut = false;
	const blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, FAILURES_TO_SIMULATE, Error, FAILURES_TO_SIMULATE, EXECUTION_TIME);
	const resilient = new Resilient()
		.timeoutAfter(TIMEOUT)
		.ifTimeout(context => timedOut = true);

	// Act
	await resilient.execute(intentionalMisinformation);

	// Assert
	t.true(timedOut);
	t.true(resilient.executionContext.exceptions[0] instanceof TimeoutError);
});

test("Execute with Throttle", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 5;
	const EXECUTIONS = 10;
	const RATE_LIMIT = 10;
	let entered = 0;
	let exited = 0;
	let throttled = 0;
	var blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE, 7000);
	var resilient = new Resilient()
		.throttle(RATE_LIMIT)
		.ifThrottled(context => throttled++)
		.whenEntering(context => entered++)
		.whenExiting(context => exited++);

	// Act
	for (let executions = 0; executions < EXECUTIONS; executions++)
		await resilient.execute(intentionalMisinformation);

	// Assert
	t.is(entered, EXECUTIONS);
	t.is(exited, EXECUTIONS);
	t.is(throttled, 0);
});

test("Execute with Throttle is Throttled", async t =>
{
	// Arrange
	const FAILURES_TO_SIMULATE = 13;
	const EXECUTIONS = 21;
	const RATE_LIMIT = 5;
	let entered = 0;
	let exited = 0;
	let throttled = 0;
	var blackOps = new OperationSimulator();
	const intentionalMisinformation = async () => await blackOps.simulate(null, null, 0, Error, FAILURES_TO_SIMULATE, 7000);
	var resilient = new Resilient()
		.throttle(RATE_LIMIT)
		.ifThrottled(context => throttled++)
		.whenEntering(context => entered++)
		.whenExiting(context => exited++);

	// Act
	for (let executions = 0; executions < EXECUTIONS; executions++)
		await resilient.execute(intentionalMisinformation);

	// Assert
	t.is(entered, EXECUTIONS);
	t.is(exited, EXECUTIONS);
	t.is(throttled, EXECUTIONS - RATE_LIMIT);
});