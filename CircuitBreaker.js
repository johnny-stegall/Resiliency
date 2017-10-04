import {Guard, ArgumentError} from "../Guard/Guard.js";
import OpenCircuitError from "./OpenCircuitError.js";

// The different states of a circuit
const CircuitState = Object.freeze(
{
	Closed: "Closed",
	HalfOpen: "Half-Open",
	Isolated: "Isolated",
	Open: "Open"
});

/******************************************************************************
* Measures faults and breaks the circuit when the specified threshold is
* exceeded. Does not orchestrate retries.
******************************************************************************/
class CircuitBreaker
{
	attempts = 0;
	failureThreshold;
	onTrip;
	openTimestamp;
	resetTimeout = 0;
	state = CircuitState.Closed;
	timerId;

	/****************************************************************************
	* Gets the attempts.
	****************************************************************************/
	get attempts()
	{
		return this.attempts;
	}

	/****************************************************************************
	* Gets the failure threshold.
	****************************************************************************/
	get failureThreshold()
	{
		return this.failureThreshold;
	}

	/****************************************************************************
	* Gets the open timestamp.
	****************************************************************************/
	get openTimestamp()
	{
		return this.openTimestamp;
	}

	/****************************************************************************
	* Gets the reset timeout.
	****************************************************************************/
	get resetTimeout()
	{
		return this.resetTimeout;
	}

	/****************************************************************************
	* Gets the circuit state.
	****************************************************************************/
	get state()
	{
		return this.state;
	}

	/****************************************************************************
	* Gets the timer ID used to track resetting the circuit.
	****************************************************************************/
	get timerId()
	{
		return this.timerId;
	}

	/****************************************************************************
	* Creates an instance of CircuitBreaker.
	****************************************************************************/
	constructor()
	{
	}

	/****************************************************************************
	* Changes the circuit state to closed.
	****************************************************************************/
	close()
	{
		transitionTo(this, CircuitState.Closed);
	}

	/****************************************************************************
	* Called during execution flow. Throws an exception if the circuit is open.
	****************************************************************************/
	execute()
	{
		if (this.state == CircuitState.Isolate || this.state == CircuitState.Open)
			throw new OpenCircuitError();

		this.attempts++;

		if (this.attempts > this.failureThreshold)
			transitionTo(this, CircuitState.Open);
	}

	/****************************************************************************
	* Executes the specified user code whenever the circuit breaker state
	* changes. The method called will be passed the the old and new states of
	* the circuit.
	*
	* @param {function} userCode The user code.
	****************************************************************************/
	ifTripped(userCode)
	{
		Guard.assertType(userCode, Function, "userCode");

		this.onTrip = userCode;
		return this;
	}

	/****************************************************************************
	* Changes the circuit state to isolate.
	****************************************************************************/
	isolate()
	{
		transitionTo(this, CircuitState.Isolate);
	}

	/****************************************************************************
	* Changes the circuit state to open.
	****************************************************************************/
	open()
	{
		transitionTo(this, CircuitState.Open);
	}

	/****************************************************************************
	* Sets the reset timeout at which the circuit breaker state will attempt to
	* reset.
	****************************************************************************/
	resetAfter(delay)
	{
		Guard.assertType(delay, Number, "delay");
		Guard.assertCondition(delay > 0, "delay", "Delay must be greater than 0.");

		this.resetTimeout = delay;
		return this;
	}

	/****************************************************************************
	* Sets the failure threshold that is acceptable before the circuit state is
	* set to open.
	****************************************************************************/
	openCircuitAfter(failureThreshold)
	{
		Guard.assertType(failureThreshold, Number, "failureThreshold");
		Guard.assertCondition(failureThreshold > 0, "failureThreshold", "failureThreshold must be greater than 0.");

		this.failureThreshold = failureThreshold;
		return this;
	}
}

/******************************************************************************
* Changes the state.
*
* @param {CircuitBreaker} circuitBreaker The circuit breaker.
* @param {CircuitState} state The state to change to.
******************************************************************************/
function transitionTo(circuitBreaker, state)
{
	Guard.assertEnum(state, CircuitState, "CircuitState");

	// Ignore being tripped into the same state
	if (circuitBreaker.state == state)
		return;

	let from = circuitBreaker.state;
	circuitBreaker.state = state;

	if (state == CircuitState.Closed)
	{
		circuitBreaker.attempts = 0;
		circuitBreaker.openTimestamp = null;
		clearTimeout(circuitBreaker.timerId);
	}
	else if (state == CircuitState.HalfOpen)
		circuitBreaker.attempts = circuitBreaker.failureThreshold - 1;
	else if (state == CircuitState.Isolate)
	{
		circuitBreaker.openTimestamp = Date.now();
		clearTimeout(circuitBreaker.timerId);
	}
	else if (state == CircuitState.Open)
	{
		circuitBreaker.timerId = setTimeout(() => transitionTo(circuitBreaker, CircuitState.HalfOpen), circuitBreaker.resetTimeout);
		circuitBreaker.openTimestamp = Date.now();
	}

	if (circuitBreaker.onTrip != null)
		circuitBreaker.onTrip(from, circuitBreaker.state);
}

export
{
	CircuitState,
	CircuitBreaker,
	OpenCircuitError
};