import {Guard, ArgumentError} from "../Guard/Guard.js";
import {CircuitBreaker, CircuitState, OpenCircuitError} from "./CircuitBreaker.js";
import {Backoff, RetryPolicy} from "./RetryPolicy.js";
import TimeoutError from "./TimeoutError.js";

/******************************************************************************
* Provides context for execution events.
******************************************************************************/
class ExecutionContext
{
	attempts = 0;
	correlationId = ExecutionContext.newGuid();
	elapsedTime = 0;
	exceptions = [];
	startTime;

	/****************************************************************************
	* Gets the number of execution attempts.
	****************************************************************************/
	get attempts()
	{
		return this.attempts;
	}

	/****************************************************************************
	* Gets an ID guaranteed to be unique each execution.
	****************************************************************************/
	get correlationId()
	{
		return this.correlationId;
	}

	/****************************************************************************
	* Gets the elapsed time.
	****************************************************************************/
	get elapsedTime()
	{
		return this.elapsedTime;
	}

	/****************************************************************************
	* Gets any exceptions thrown in the order they were thrown.
	****************************************************************************/
	get exceptions()
	{
		return this.exceptions;
	}

	/****************************************************************************
	* Gets any exceptions thrown in the order they were thrown.
	****************************************************************************/
	get startTime()
	{
		return this.startTime;
	}

	/****************************************************************************
	* Creates an instance of ExecutionContext.
	****************************************************************************/
	constructor()
	{
	}

	/****************************************************************************
	* Creates an RFC 4122 compliant UUID.
	****************************************************************************/
	static newGuid()
	{
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c)
		{
			var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}
}

/******************************************************************************
* Wraps method execution using the decorator pattern with various fault
* tolerant patterns.
******************************************************************************/
class Resilient
{
	circuitBreaker;
	executionContext;
	fallbackExecution;
	rateLimit;
	retryPolicy;
	timeout;

	/****************************************************************************
	* Gets the circuit breaker.
	****************************************************************************/
	get circuitBreaker()
	{
    return this.circuitBreaker;
	}

	/****************************************************************************
	* Gets the execution context.
	****************************************************************************/
	get executionContext()
	{
    return this.executionContext;
	}

	/****************************************************************************
	* Gets the user code to execute if execution fails.
	****************************************************************************/
	get fallbackExecution()
	{
    return this.fallbackExecution;
	}

	/****************************************************************************
	* Gets the limit at which the user code can be executed before execution
	* waits.
	****************************************************************************/
	get rateLimit()
	{
		return this.rateLimit;
	}

	/****************************************************************************
	* Gets the retry policy.
	****************************************************************************/
	get retryPolicy()
	{
    return this.retryPolicy;
	}

	/****************************************************************************
	* Gets the timeout in milliseconds.
	****************************************************************************/
	get timeout()
	{
    return this.timeout;
	}

	/****************************************************************************
	* Creates an instance of Resilient.
	****************************************************************************/
	constructor()
	{
	}

	/****************************************************************************
	* Executes an asynchronous method, wrapped in the specified resiliency
	* patterns.
	*
	* @param {function} userCode The method to execute.
	* @returns The result of executing the user code.
	****************************************************************************/
	async execute(userCode)
	{
		Guard.assertType(userCode, Function, "userCode");

		this.executionContext = new ExecutionContext();

		if (this.onEntry != null)
			await this.onEntry(this.executionContext);

		while (shouldRetry(this))
		{
			try
			{
				if (this.executionContext.attempts > 0)
				{
					if (this.retryPolicy.delay > 0)
						await wait(this);

					if (this.retryPolicy.onRetry != null)
						await this.retryPolicy.onRetry(this.executionContext);
				}
				else
					this.executionContext.startTime = Date.now();

				if (this.circuitBreaker != null)
					this.circuitBreaker.execute(this.executionContext);

				this.executionContext.attempts++;
				let promises = [];
				let result;

				if (this.timeout > 0)
					promises.push(new Promise((resolve, reject) => setTimeout(() => reject(new TimeoutError(this.timeout)), this.timeout)));

				if (this.rateLimit > 0)
					promises.push(new Promise(throttle(userCode, this.rateLimit)));
				else
					promises.push(userCode());

				result = await Promise.race(promises);

				if (this.retryPolicy != null)
				{
					if (this.retryPolicy.canAbortIf(result))
					{
						this.retryPolicy.onAbort(this.executionContext);
						break;
					}
					else if (this.retryPolicy.canRetryIf(result))
						continue;
				}

				if (this.onSuccess != null)
					await this.onSuccess(this.executionContext);

				if (this.circuitBreaker != null)
					this.circuitBreaker.close();

				if (this.onExit != null)
					await this.onExit(this.executionContext);

				return result;
			}
			catch (e)
			{
				if (e.name == "TimeoutError")
				{
					if (this.onTimeout != null)
						await this.onTimeout(this.executionContext);
				}

				this.executionContext.exceptions.push(e);
			}
			finally
			{
				this.executionContext.elapsedTime = Date.now() - this.executionContext.startTime;
			}
		}

		if (this.onFailure != null)
			await this.onFailure(this.executionContext);

		if (this.onExit != null)
			await this.onExit(this.executionContext);

		if (this.fallbackExecution != null)
		{
			if (this.onFallback != null)
				await this.onFallback(this.executionContext);

			return await this.fallbackExecution();
		}
}

	/****************************************************************************
	* Executes the specified user code if execution fails.
	*
	* @param {function} userCode The failover user code.
	* @returns This instance of Resilient.
	****************************************************************************/
	fallbackTo(userCode)
	{
		Guard.assertType(userCode, Function, "userCode");

		this.fallbackExecution = userCode;
		return this;
	}

	/****************************************************************************
	* Executes the specified user code after an execution attempt fails. The
	* method called will be passed the execution context.
	*
	* @param {function} userCode The user code.
	****************************************************************************/
	ifFailure(userCode)
	{
		Guard.assertType(userCode, Function, "userCode");

		this.onFailure = userCode;
		return this;
	}

	/****************************************************************************
	* Executes the specified user code after all attempts fail and just before
	* falling back. The method called will be passed the execution context.
	*
	* @param {function} userCode The user code.
	****************************************************************************/
	ifFallback(userCode)
	{
		Guard.assertType(userCode, Function, "userCode");

		this.onFallback = userCode;
		return this;
	}

	/****************************************************************************
	* Executes the specified user code after execution succeeds. The method
	* called will be passed the execution context.
	*
	* @param {function} userCode The user code.
	****************************************************************************/
	ifSuccess(userCode)
  {
		Guard.assertType(userCode, Function, "userCode");

		this.onSuccess = userCode;
		return this;
	}

	/****************************************************************************
	* Executes the specified user code after an execution is throttled. The
	* method called will be passed the execution context.
	*
	* @param {function} userCode The user code.
	****************************************************************************/
	ifThrottled(userCode)
	{
		Guard.assertType(userCode, Function, "userCode");

		this.onThrottled = userCode;
		return this;
	}

	/****************************************************************************
	* Executes the specified user code after an execution attempt times out. The
	* method called will be passed the execution context.
	*
	* @param {function} userCode The user code.
	****************************************************************************/
	ifTimeout(userCode)
	{
		Guard.assertType(userCode, Function, "userCode");

		this.onTimeout = userCode;
		return this;
	}

	/****************************************************************************
	* Defines rules for making additional attempts if the first attempt at
	* execution of user code fails.
	*
	* @param {RetryPolicy} retryPolicy The retry policy.
	* @returns This instance of Resilient.
	****************************************************************************/
	retryWith(retryPolicy)
	{
		Guard.assertType(retryPolicy, RetryPolicy, "retryPolicy");

		this.retryPolicy = retryPolicy;
		return this;
	}

	/****************************************************************************
	* Defines rules for short-circuiting user code that fails beyond the failure
	* threshold. Setting a circuit breaker without a retry policy causes
	* execution to retry indefinitely.
	*
	* @param {CircuitBreaker} circuitBreaker The circuit breaker.
	* @returns This instance of Resilient.
	****************************************************************************/
	shortCircuitWith(circuitBreaker)
	{
		Guard.assertType(circuitBreaker, CircuitBreaker, "circuitBreaker");

		this.circuitBreaker = circuitBreaker;
		return this;
	}

	/****************************************************************************
	* Sets the duration user code may execute before being stopped.
	*
	* @param {number} timeout The timeout.
	* @returns This instance of Resilient.
	****************************************************************************/
	timeoutAfter(timeout)
	{
		Guard.assertType(timeout, Number, "timeout");
		Guard.assertCondition(timeout > 0, "timeout", "timeout must be greater than 0.");

		this.timeout = timeout;
		return this;
	}

	/****************************************************************************
	* Defines the rate at which the user code can be executed.
	*
	* @param {int} rateLimit The rate of executions.
	* @returns This instance of Resilient.
	****************************************************************************/
	throttle(rateLimit)
	{
		Guard.assertType(rateLimit, Number, "rateLimit");
		Guard.assertCondition(rateLimit > 0, "rateLimit", "rateLimit must be greater than 0.");

		this.throttleLimit = rateLimit;
		return this;
	}

	/****************************************************************************
	* Executes the specified user code when beginning execution. The method
	* called will be passed the execution context.
	*
	* @param {function} userCode The user code.
	****************************************************************************/
	whenEntering(userCode)
	{
		Guard.assertType(userCode, Function, "userCode");

		this.onEntry = userCode;
		return this;
	}

	/****************************************************************************
	* Executes the specified user code when exiting execution. The method
	* called will be passed the execution context.
	*
	* @param {function} userCode The user code.
	****************************************************************************/
	whenExiting(userCode)
	{
		Guard.assertType(userCode, Function, "userCode");

		this.onExit = userCode;
		return this;
	}
}

/****************************************************************************
* Determines if execution should keep making further attempts.
*
* @param {Resilient} resilient The Resilient instance.
* @returns True if attempts should continue, false otherwise.
****************************************************************************/
function shouldRetry(resilient)
{
	if (resilient.retryPolicy != null)
	{
		if (resilient.retryPolicy.maxAttempts === 0)
			return true;
		else
			return resilient.executionContext.attempts < resilient.retryPolicy.maxAttempts;
	}
	else
		return resilient.executionContext.attempts === 0;
}

/****************************************************************************
* Limits user code being executed to the specified rate.
*
* @param {int} rateLimit The maximum number of executions before user code
* is no longer executed.
****************************************************************************/
function throttle(userCode, rateLimit)
{
	Guard.assertType(userCode, Function, "userCode");
	Guard.assertType(rateLimit, Number, "rateLimit");
	Guard.assertCondition(rateLimit > 0, "rateLimit", "rateLimit must be greater than 0.");

	let lastExecution;
	let lastRan;
	
	return function()
	{
    const context = this;
		const args = arguments;
		
		if (!lastRan)
		{
      userCode.apply(context, args);
      lastRan = Date.now();
		}
		else
		{
      clearTimeout(lastExecution);
			lastExecution = setTimeout(async () =>
			{
				if ((Date.now() - lastRan) >= rateLimit)
				{
          userCode.apply(context, args);
          lastRan = Date.now();
        }
      }, rateLimit - (Date.now() - lastRan));
    }
  }
}

/****************************************************************************
* Blocks execution based on the retry policy and execution.
*
* @param {Resilient} resilient The Resilient instance.
****************************************************************************/
function wait(resilient)
{
	Guard.assertType(resilient, Resilient, "resilient");

	const attempts = resilient.executionContext.attempts;
	let delay = resilient.retryPolicy.delay;

	if (resilient.retryPolicy.backoff === Backoff.Exponential)
		delay = Math.pow(attempts, attempts) * delay;
	else if (resilient.retryPolicy.backoff === Backoff.Linear)
		delay = attempts * delay;
	else if (resilient.retryPolicy.backoff === Backoff.Static)
		delay = delay;
	else if (resilient.retryPolicy.backoff === Backoff.Random)
	{
		const randomNumber = Math.floor(Math.random() * 10) + 1;
		delay = randomNumber * delay;
	}

	return new Promise(resolve => setTimeout(resolve, delay));
}

export
{
	Resilient,
	RetryPolicy,
	Backoff,
	CircuitBreaker,
	CircuitState,
	OpenCircuitError,
	TimeoutError
};