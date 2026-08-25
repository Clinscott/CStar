export const NATURAL_SET_REVOCATION_CASES = [
    ['stop-mission', 'Stop this mission.'],
    ['pause-mission', 'Pause the mission!'],
    ['cancel-it', 'Cancel it.'],
    ['revoke-that', 'Revoke that.'],
    ['withdraw-this-mission', 'Withdraw this mission.'],
    ['continuous-authorize-denial', 'I am not authorizing this.'],
    ['continuous-permit-denial', 'I am not permitting the mission.'],
    ['continuous-allow-denial', 'I am not allowing that.'],
    ['simple-authorize-denial', 'I do not authorize this.'],
    ['simple-permit-denial', 'I do not permit it.'],
    ['simple-allow-denial', 'I do not allow this mission.'],
] as const;

export const NATURAL_SET_INFORMATIONAL_CASES = [
    'The mission is ready.',
    'Telemetry is stored.',
    'This record is informational.',
] as const;
