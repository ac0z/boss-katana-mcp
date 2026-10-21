import { describe, expect, it } from 'vitest';
import { createCdpBts } from '../src/bts.js';
import { launch } from '../src/launcher.js';
import { createHandlers } from '../src/tools.js';

const json = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

describe.skipIf(process.env.KATANA_E2E !== '1')('live BOSS TONE STUDIO', () => {
  it('launches or finds BTS', async () => {
    expect((await launch()).ok).toBe(true);
  });

  it('changes amp.volume by one and restores it', async () => {
    const h = createHandlers({ bts: createCdpBts(), launch: () => launch() });
    const before = json(await h.get({ sections: ['amp'] })).amp['amp.volume'] as number;
    const next = before === 100 ? 99 : before + 1;
    try {
      expect(json(await h.set({ changes: { 'amp.volume': next } })).applied['amp.volume']).toBe(next);
      expect(json(await h.get({ sections: ['amp'] })).amp['amp.volume']).toBe(next);
    } finally {
      await h.set({ changes: { 'amp.volume': before } });
    }
  });
});
