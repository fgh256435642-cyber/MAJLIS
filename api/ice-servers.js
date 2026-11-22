export default function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const username = process.env.TURN_USERNAME || '';
  const password = process.env.TURN_PASSWORD || '';

  const iceServers = [
    { urls: 'stun:stun.relay.metered.ca:80' },
  ];

  if (username && password) {
    iceServers.push(
      { urls: 'turn:global.relay.metered.ca:80', username, credential: password },
      { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username, credential: password },
      { urls: 'turn:global.relay.metered.ca:443', username, credential: password },
      { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username, credential: password }
    );
  }

  response.setHeader('Cache-Control', 'no-store');
  return response.status(200).json({ iceServers });
}
