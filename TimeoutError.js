/******************************************************************************
* An exception thrown because an operation timed out.
******************************************************************************/
class TimeoutError extends Error
{
	/******************************************************************************
	* Creates an instance of TimeoutError.
	*
	* @param {number} duration The timeout duration in milliseconds.
	******************************************************************************/
	constructor(duration)
	{
		super(`Operation timed out after ${duration} milliseconds.`);
		
		this.name = "TimeoutError";
  }
}

export default TimeoutError;