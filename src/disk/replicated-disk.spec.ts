import { FakeDisk } from '../testing/fake-disk';
import { ReplicatedDisk } from './replicated-disk';

describe('ReplicatedDisk', () => {
  let primary: FakeDisk;
  let replica1: FakeDisk;
  let replica2: FakeDisk;

  beforeEach(() => {
    primary = new FakeDisk();
    replica1 = new FakeDisk();
    replica2 = new FakeDisk();
  });

  describe("strategy: 'all' (default)", () => {
    let disk: ReplicatedDisk;

    beforeEach(() => {
      disk = new ReplicatedDisk(primary, [replica1, replica2]);
    });

    it('writes to primary and all replicas', async () => {
      await disk.put('file.txt', 'hello');
      expect(await primary.exists('file.txt')).toBe(true);
      expect(await replica1.exists('file.txt')).toBe(true);
      expect(await replica2.exists('file.txt')).toBe(true);
    });

    it('writes correct content to all', async () => {
      await disk.put('file.txt', 'content');
      expect(await primary.get('file.txt', { responseType: 'string' })).toBe('content');
      expect(await replica1.get('file.txt', { responseType: 'string' })).toBe('content');
      expect(await replica2.get('file.txt', { responseType: 'string' })).toBe('content');
    });

    it('deletes from all', async () => {
      await primary.put('file.txt', 'x');
      await replica1.put('file.txt', 'x');
      await replica2.put('file.txt', 'x');
      await disk.delete('file.txt');
      expect(await primary.exists('file.txt')).toBe(false);
      expect(await replica1.exists('file.txt')).toBe(false);
      expect(await replica2.exists('file.txt')).toBe(false);
    });

    it('reads only from primary', async () => {
      await primary.put('file.txt', 'primary-data');
      await replica1.put('file.txt', 'replica-data');

      const getReplica = jest.spyOn(replica1, 'get');
      const result = await disk.get('file.txt', { responseType: 'string' });
      expect(result).toBe('primary-data');
      expect(getReplica).not.toHaveBeenCalled();
    });

    it('exposes replicaDisks getter', () => {
      expect(disk.replicaDisks).toHaveLength(2);
    });
  });

  describe("strategy: 'async'", () => {
    let disk: ReplicatedDisk;

    beforeEach(() => {
      disk = new ReplicatedDisk(primary, [replica1], { strategy: 'async' });
    });

    it('returns primary result immediately without waiting for replicas', async () => {
      let replicaResolved = false;
      jest.spyOn(replica1, 'put').mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 100));
        replicaResolved = true;
        return true;
      });

      const result = await disk.put('file.txt', 'data');
      expect(result).toBe(true);
      expect(replicaResolved).toBe(false); // replica not yet done
    });

    it('eventually replicates to replicas', async () => {
      await disk.put('file.txt', 'async-data');
      // Let async replica complete
      await new Promise((r) => setImmediate(r));
      // replica1 should have the file (eventually)
      expect(await primary.exists('file.txt')).toBe(true);
    });
  });

  describe("strategy: 'quorum'", () => {
    it('succeeds when majority succeed', async () => {
      const failingReplica = new FakeDisk();
      jest.spyOn(failingReplica, 'put').mockRejectedValue(new Error('replica down'));

      const disk = new ReplicatedDisk(primary, [replica1, failingReplica], { strategy: 'quorum' });
      // 2 out of 3 succeed → quorum
      await expect(disk.put('file.txt', 'data')).resolves.toBe(true);
    });

    it('throws when quorum not reached', async () => {
      const failingReplica1 = new FakeDisk();
      const failingReplica2 = new FakeDisk();
      jest.spyOn(primary, 'put').mockRejectedValue(new Error('primary down'));
      jest.spyOn(failingReplica1, 'put').mockRejectedValue(new Error('replica down'));

      const disk = new ReplicatedDisk(primary, [failingReplica1, failingReplica2], {
        strategy: 'quorum',
      });
      // 0 out of 3 succeed → quorum fails
      await expect(disk.put('file.txt', 'data')).rejects.toThrow();
    });
  });

  it('replicates setVisibility to all', async () => {
    const setVisPrimary = jest.spyOn(primary, 'setVisibility').mockResolvedValue(true);
    const setVisReplica = jest.spyOn(replica1, 'setVisibility').mockResolvedValue(true);

    const disk = new ReplicatedDisk(primary, [replica1]);
    await disk.setVisibility('file.txt', 'public');
    expect(setVisPrimary).toHaveBeenCalledWith('file.txt', 'public');
    expect(setVisReplica).toHaveBeenCalledWith('file.txt', 'public');
  });

  it('replicates makeDirectory to all', async () => {
    const disk = new ReplicatedDisk(primary, [replica1]);
    await disk.makeDirectory('new-dir');
    expect(await primary.exists('new-dir')).toBeDefined();
  });
});
