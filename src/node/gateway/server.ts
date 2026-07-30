import { failRetiredGateway } from '../retired_gateway.js';

// Importing the historical executable is itself an attempted activation. Fail
// before environment loading, server construction, route registration, or bind.
failRetiredGateway();
