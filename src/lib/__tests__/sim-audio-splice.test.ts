import { describe, it, expect } from 'vitest';
import { buildSpliceFilterGraph } from '@/lib/sim-audio-splice';

// The graph strings below are the shapes verified against real ffmpeg on a
// synthetic 40s recording (head -22dB / patch -43dB / tail -22dB landed in the
// right places, output 45.008s with no per-join drift).
describe('buildSpliceFilterGraph', () => {
  it('splits the original when both head and tail survive', () => {
    const graph = buildSpliceFilterGraph(10, 25, 40);
    expect(graph.keepsHead).toBe(true);
    expect(graph.keepsTail).toBe(true);
    expect(graph.mapLabel).toBe('[out]');
    // asplit is required: the original feeds two trims.
    expect(graph.filter).toContain('[0:a]asplit=2[s0][s1]');
    expect(graph.filter).toContain('atrim=start=0:end=10.000');
    expect(graph.filter).toContain('atrim=start=25.000');
    expect(graph.filter).toContain('[head][mid][tail]concat=n=3:v=0:a=1[out]');
  });

  it('omits the tail when the patch runs to the end', () => {
    const graph = buildSpliceFilterGraph(30, 40, 40);
    expect(graph.keepsTail).toBe(false);
    expect(graph.filter).not.toContain('asplit');
    expect(graph.filter).toContain('atrim=start=0:end=30.000');
    expect(graph.filter).toContain('[head][mid]concat=n=2:v=0:a=1[out]');
  });

  it('omits the head when the patch starts at zero', () => {
    const graph = buildSpliceFilterGraph(0, 12, 40);
    expect(graph.keepsHead).toBe(false);
    expect(graph.filter).not.toContain('asplit');
    expect(graph.filter).toContain('atrim=start=12.000');
    expect(graph.filter).toContain('[mid][tail]concat=n=2:v=0:a=1[out]');
  });

  it('needs no graph at all when the retake replaces the whole recording', () => {
    const graph = buildSpliceFilterGraph(0, 40, 40);
    expect(graph.filter).toBeNull();
    expect(graph.mapLabel).toBeNull();
  });

  it('treats sub-frame slivers at the edges as no head/tail', () => {
    const graph = buildSpliceFilterGraph(0.02, 39.98, 40);
    expect(graph.keepsHead).toBe(false);
    expect(graph.keepsTail).toBe(false);
    expect(graph.filter).toBeNull();
  });
});
