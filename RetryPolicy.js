import {Guard, ArgumentError} from "../Guard/Guard.js";

// The backoff options for methods that are retried
const Backoff = Object.freeze(
{
	Static: "Static",
	Linear: "Linear",
	Exponential: "Exponential",
	Random: "Random"
});

/******************************************************************************
* Defines rules for retrying method execution.
******************************************************************************/
class RetryPolicy
{
	abortConditions = [];
	backoff = Backoff.Static;
	delay = 0;
	maxAttempts = 1;
	onAbort;
	onRetry;
	retryConditions = [];

	/****************************************************************************
	* Gets the abort conditions.
	****************************************************************************/
	get abortConditions()
	{
		return this.abortConditions;
	}

	/****************************************************************************
	* Gets the backoff algorithm.
	****************************************************************************/
	get backoff()
	{
		return this.backoff;
	}

	/****************************************************************************
	* Gets the delay (in milliseconds) between retries.
	****************************************************************************/
	get delay()
	{
		return this.delay;
	}

	/****************************************************************************
	* Gets the maximum number of attempts before failing.
	****************************************************************************/
	get maxAttempts()
	{
		return this.maxAttempts;
	}

	/****************************************************************************
	* Gets the user code to execute before each retry.
	****************************************************************************/
	get onRetry()
	{
		return this.onRetry;
	}

	/****************************************************************************
	* Gets the retry conditions.
	****************************************************************************/
	get retryConditions()
	{
		return this.retryConditions;
	}

	/****************************************************************************
	* Creates an instance of RetryPolicy.
	****************************************************************************/
	constructor()
	{
	}

	/****************************************************************************
	* Adds a rule to abort execution if the predicate matches.
	*
	* @param {any} predicate The result to test for.
	* @returns This instance of RetryPolicy.
	****************************************************************************/
	abortIf(predicate)
	{
		this.abortConditions.push(predicate);
		return this;
	}

	/****************************************************************************
	* Determines if an execution result will abort retrying execution.
	*
	* @param {any} result The result to test for.
	* @returns True if the test result would cause execution to abort, false
	* otherwise.
	****************************************************************************/
	canAbortIf(result)
	{
		return this.abortConditions.indexOf(result) > -1;
	}

	/****************************************************************************
	* Determines if an execution result will cause retrying execution.
	*
	* @param {any} result The result to test for.
	* @returns True if the test result would cause execution to retry, false
	* otherwise.
	****************************************************************************/
	canRetryIf(result)
	{
		return this.retryConditions.indexOf(result) > -1;
	}

	/****************************************************************************
	* Adds a rule to delay for the specified length of time (in milliseconds)
	* between retries.
	*
	* @param {int} length The length of time.
	* @returns This instance of RetryPolicy.
	****************************************************************************/
	delayBetweenRetries(delay)
	{
		Guard.assertType(delay, Number, "delay");
		Guard.assertCondition(delay > -1, "delay", "delay can't be negative.");

		this.delay = delay;
		return this;
	}

	/****************************************************************************
	* Executes the user code when an attempt aborts.
	*
	* @param {function} userCode Code to execute after abortion.
	* @returns This instance of RetryPolicy.
	****************************************************************************/
	ifAbort(userCode)
	{
		Guard.assertType(userCode, Function, "userCode");

		this.onAbort = userCode;
		return this;
	}

	/****************************************************************************
	* Executes the user code when an attempt fails and execution is about to
	* retry.
	*
	* @param {function} userCode Code to execute just before a retry.
	* @returns This instance of RetryPolicy.
	****************************************************************************/
	ifRetry(userCode)
	{
		Guard.assertType(userCode, Function, "userCode");

		this.onRetry = userCode;
		return this;
	}

	/****************************************************************************
	* Adds a rule to retry if the execution result matches.
	*
	* @param {any} predicate The result to test for.
	* @returns This instance of RetryPolicy.
	****************************************************************************/
	retryIf(predicate)
	{
		this.retryConditions.push(predicate);
		return this;
	}

	/****************************************************************************
	* Adds a rule that specifies the maximum number of attempts. Set to 0 to
	* retry forever.
	*
	* @param {int} length The maximum attempts.
	* @returns This instance of RetryPolicy.
	****************************************************************************/
	stopAfter(maxAttempts)
	{
		Guard.assertType(maxAttempts, Number, "maxAttempts");
		Guard.assertCondition(maxAttempts > 0, "maxAttempts", "maxAttempts must be greater than 0.");

		this.maxAttempts = maxAttempts;
		return this;
	}

	/****************************************************************************
	* Adds a rule to reduce backpressure by applying a back-off algorithm to the
	* delay between retries.
	*
	* @param {int} length The back-off algorithm.
	* @returns This instance of RetryPolicy.
	****************************************************************************/
	useBackOff(backoff)
	{
		Guard.assertCondition(Object.keys(Backoff).indexOf(backoff) > -1, "backoff", "Invalid value specified for backoff.");

		this.backoff = backoff;
		return this;
	}
}

export
{
	Backoff,
	RetryPolicy
};