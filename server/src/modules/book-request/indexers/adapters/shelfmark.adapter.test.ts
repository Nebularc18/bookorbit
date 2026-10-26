import { ShelfmarkAdapter } from './shelfmark.adapter';
import { safeFetch } from '../../../../common/utils/safe-fetch';
import type { ResolvedIndexerConfig } from '../indexer-adapter';

vi.mock('../../../../common/utils/safe-fetch', () => ({ safeFetch: vi.fn() }));
vi.mock('../../../../common/utils/ssrf.utils', () => ({ ensureSafeUrl: vi.fn((url: string) => Promise.resolve(new URL(url))) }));

const config = {
  id: 10,
  baseUrl: 'http://192.0.2.1:8084',
  credential: 'test-only-key',
  allowPrivateAddress: true,
} as ResolvedIndexerConfig;

describe('ShelfmarkAdapter timeouts', () => {
  afterEach(() => vi.restoreAllMocks());

  it('allows a release search beyond the 300-second Shelfmark budget', async () => {
    vi.mocked(safeFetch).mockResolvedValue(new Response(JSON.stringify({ releases: [] })));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await new ShelfmarkAdapter().search(
      { title: 'Pride and Prejudice', mediaKind: 'ebook', limit: 50 } as never,
      config,
      new AbortController().signal,
    );
    expect(timeout).toHaveBeenCalledWith(330_000);
  });

  it('keeps status checks bounded to thirty seconds', async () => {
    vi.mocked(safeFetch).mockResolvedValue(new Response(JSON.stringify({ queued: {}, complete: {} })));
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    await new ShelfmarkAdapter().status(config);
    expect(timeout).toHaveBeenCalledWith(30_000);
  });
});
