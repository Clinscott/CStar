/**
 * Build the bounded SessionStart profile digest.
 *
 * Profile persona preferences are intentionally excluded. Active persona
 * context may be projected only by the bounded cstar_status response.
 */
export function buildSessionProfileDigest(profile, services) {
    let prefs = {};
    try {
        prefs = JSON.parse(profile.preferences || '{}');
    } catch {
        prefs = {};
    }
    const prefKeys = Object.keys(prefs).slice(0, 5);
    const parts = [
        `user: ${profile.display_name || profile.email || profile.oauth_sub}`,
        `services: ${services.length > 0 ? services.join(', ') : 'none'}`,
        `prefs: ${prefKeys.length > 0 ? prefKeys.join(', ') : 'none'}`,
    ];
    return ('[Corvus Star profile] ' + parts.join(' | ')).slice(0, 400);
}
