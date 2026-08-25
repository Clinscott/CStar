# Direct Provider Probe Boundary

The orphan `scripts/test_adc.js` provider handshake is retired. Invoking it
returns
`legacy_adc_provider_probe_retired_use_supported_host_provider_surface` before
reading environment variables, loading dotenv content, opening a provider
client, or making a network request.

The Odin game client remains offline by default. An ambient `GOOGLE_API_KEY` does not activate provider behavior;
a caller must inject a key explicitly. Explicit injection is a capability only,
not authority to run a live provider call. The caller must still use the
supported host/provider surface and preserve the applicable operator and
lifecycle gates.

Neither compatibility path grants live-source, provider-spend, secret,
configuration, installation, restart, activation, deployment, or production
authority.
