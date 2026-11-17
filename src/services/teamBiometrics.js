/**
 * Calibrated Biometric Profiles for Project Team Members
 * 5 Unique Cardiovascular Morphology Signatures (Vedant, Yadnyesh, Hetal, Samiksha, Tejas)
 */

export const TEAM_MEMBERS = [
  {
    key: 'vedant',
    id: '11111111-1111-4111-8111-111111111111',
    fullName: 'Vedant',
    email: 'vedant@biolock.internal',
    defaultPin: '1234',
    bpm: 72,
    // Early systolic peak at index 2, sharp dicrotic reflection
    template: [86, 178, 233, 178, 91, 58, 68, 77, 64, 40, 22, 15, 15, 15, 15, 15, 15, 15, 15, 15]
  },
  {
    key: 'yadnyesh',
    id: '22222222-2222-4222-8222-222222222222',
    fullName: 'Yadnyesh',
    email: 'yadnyesh@biolock.internal',
    defaultPin: '5678',
    bpm: 68,
    // Mid-late systolic peak at index 11, broad arterial wave
    template: [25, 25, 25, 24, 24, 24, 24, 25, 36, 84, 177, 233, 178, 91, 55, 60, 67, 58, 41, 28]
  },
  {
    key: 'hetal',
    id: '33333333-3333-4333-8333-333333333333',
    fullName: 'Hetal',
    email: 'hetal@biolock.internal',
    defaultPin: '4321',
    bpm: 80,
    // Systolic peak at index 5, steep descending limb
    template: [25, 26, 36, 84, 176, 231, 176, 88, 54, 60, 67, 57, 37, 22, 16, 15, 15, 15, 15, 15]
  },
  {
    key: 'samiksha',
    id: '44444444-4444-4444-8444-444444444444',
    fullName: 'Samiksha',
    email: 'samiksha@biolock.internal',
    defaultPin: '8765',
    bpm: 75,
    // Systolic peak at index 8, balanced dicrotic notch
    template: [25, 25, 24, 24, 25, 36, 83, 176, 231, 177, 90, 57, 65, 74, 63, 42, 26, 19, 16, 16]
  },
  {
    key: 'tejas',
    id: '55555555-5555-4555-8555-555555555555',
    fullName: 'Tejas',
    email: 'tejas@biolock.internal',
    defaultPin: '9999',
    bpm: 84,
    // Delayed systolic peak at index 14, secondary reflection
    template: [25, 26, 26, 27, 27, 28, 28, 29, 29, 30, 32, 44, 92, 186, 243, 193, 112, 79, 76, 67]
  }
];

export function findTeamMember(query) {
  if (!query || typeof query !== 'string') return null;
  const q = query.toLowerCase().trim();
  return TEAM_MEMBERS.find(m => 
    q.includes(m.key) || 
    m.fullName.toLowerCase().includes(q) || 
    m.email.toLowerCase().includes(q) ||
    m.id === query
  ) || null;
}
