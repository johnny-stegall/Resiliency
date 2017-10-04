/******************************************************************************
* An exception thrown because a circuit is open in a Circuit Breaker.
******************************************************************************/
class OpenCircuitError extends Error
{
	/******************************************************************************
	* Creates an instance of OpenCircuitError.
	******************************************************************************/
	constructor()
	{
		super(`Execution cannot continue because a circuit is open.`);

		this.name = "OpenCircuitError";
  }
}

export default OpenCircuitError;