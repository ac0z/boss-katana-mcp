import { describe, expect, it } from 'vitest';
import { btsInstalled, createSandbox } from './bts-sandbox.js';

describe.skipIf(!btsInstalled)('BTS sandbox', () => {
  it('loads Parameter with factory defaults', () => {
    const sb = createSandbox();
    expect(sb.run('Parameter.value("PATCH%AMP%1", INTEGER1x7, 0)')).toBe(50);
  });

  it('routes an incoming DT1 into Parameter and notifies observers', () => {
    const sb = createSandbox();
    sb.run('globalThis.__seen = []; Parameter.addObserver({ notify: (b, f, t) => __seen.push([b, f, t]) })');
    sb.incoming('F0411001050712200006013722F7'); // PATCH%AMP volume = 55
    expect(sb.run('Parameter.value("PATCH%AMP%1", INTEGER1x7, 0)')).toBe(55);
    expect(sb.run('JSON.stringify(__seen)')).toBe('[["PATCH%AMP",1,2]]');
  });
});
