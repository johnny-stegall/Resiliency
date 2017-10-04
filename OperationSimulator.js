class OperationSimulator
{
	failuresSimulated = 0;

	/****************************************************************************
	* Creates an instance of OperationSimulator.
	****************************************************************************/
	constructor()
	{
	}

	/****************************************************************************
	* Simulates an operation that takes the specified amount of time to execute
	* and fails the specified number of times, then throws the specified
	* exception the specified number of times, before finally succeeding.
	*
	* @param {object} success The succesful return value.
	* @param {object} fail The failed return value.
	* @param {object} failures The number of failures to simulate before
	* succeeding.
	* @param {object} exceptionType The type of exception thrown.
	* @param {object} exceptions The number of exceptions to simulate before
	* succeeding.
	* @param {object} success The amount of time to delay simulating
	* execution.
	* @returns The specified result.
	****************************************************************************/
	simulate(success, fail, failures, exceptionType = Error, exceptions, delay = 1000)
	{
		sleep(delay);

		if (failures > 0 && this.failuresSimulated < failures)
		{
			this.failuresSimulated++;
			return fail;
		}
		else if (exceptions > 0 && this.failuresSimulated < exceptions)
		{
			this.failuresSimulated++;
			throw new exceptionType("This is only a test exception. If it had been a real exception...");
		}
		else
			return success;
	}

	/****************************************************************************
	* Simulates an asynchronous operation that takes the specified amount of
	* time to execute and fails the specified number of times, then throws the
	* specified exception the specified number of times, before finally
	* succeeding.
	*
	* @param {object} success The succesful return value.
	* @param {object} fail The failed return value.
	* @param {object} failures The number of failures to simulate before
	* succeeding.
	* @param {object} exceptionType The type of exception thrown.
	* @param {object} exceptions The number of exceptions to simulate before
	* succeeding.
	* @param {object} success The amount of time to delay simulating
	* execution.
	* @returns The specified result.
	****************************************************************************/
	async simulate(success, fail, failures, exceptionType = Error, exceptions, delay = 1000)
	{
		await new Promise(resolve => setTimeout(resolve, delay));

		if (failures > 0 && this.failuresSimulated < failures)
		{
			this.failuresSimulated++;
			return fail;
		}
		else if (exceptions > 0 && this.failuresSimulated < exceptions)
		{
			this.failuresSimulated++;
			throw new exceptionType("This is only a test exception. If it had been a real exception...");
		}
		else
			return success;
	}
}

/******************************************************************************
* Emulates sleeping functions in other languages by blocking the thread for
* the specified number of milliseconds.
******************************************************************************/
function sleep(milliseconds)
{
	const startTime = Date.now();
	
	let currentDate = null;
	
	do
	{
    currentDate = Date.now();
  } while (currentDate - startTime < milliseconds);
}

export default OperationSimulator;