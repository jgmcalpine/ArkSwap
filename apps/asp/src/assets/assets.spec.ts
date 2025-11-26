import { Test, TestingModule } from '@nestjs/testing';
import { AssetStore } from './asset.store';
import { AssetsController } from './assets.controller';
import { RoundService } from '../round.service';
import { VtxoStore } from '../vtxo-store.service';
import { TransferService } from '../transfer.service';
import type { AssetMetadata } from '@arkswap/protocol';

describe('Assets', () => {
  describe('AssetStore', () => {
    let store: AssetStore;

    beforeEach(() => {
      store = new AssetStore();
    });

    it('should save and retrieve metadata', () => {
      const mockData: AssetMetadata = {
        dna: 'a'.repeat(64) as AssetMetadata['dna'],
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
        parents: [],
      };

      store.saveMetadata('tx1', mockData);

      const retrieved = store.getMetadata('tx1');
      expect(retrieved).toEqual(mockData);
      expect(retrieved?.dna).toBe('a'.repeat(64));
      expect(retrieved?.generation).toBe(0);
    });

    it('should return undefined for non-existent txid', () => {
      const result = store.getMetadata('tx2');
      expect(result).toBeUndefined();
    });

    it('should return all metadata via getAll', () => {
      const mockData1: AssetMetadata = {
        dna: 'a'.repeat(64) as AssetMetadata['dna'],
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
        parents: [],
      };

      const mockData2: AssetMetadata = {
        dna: 'b'.repeat(64) as AssetMetadata['dna'],
        generation: 1,
        cooldownBlock: 200,
        lastFedBlock: 150,
        xp: 100,
        parents: ['tx1'],
      };

      store.saveMetadata('tx1', mockData1);
      store.saveMetadata('tx2', mockData2);

      const all = store.getAll();
      expect(all.size).toBe(2);
      expect(all.get('tx1')).toEqual(mockData1);
      expect(all.get('tx2')).toEqual(mockData2);
    });
  });

  describe('AssetsController', () => {
    let controller: AssetsController;
    let store: AssetStore;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [AssetsController],
        providers: [AssetStore, RoundService, VtxoStore, TransferService],
      }).compile();

      controller = module.get<AssetsController>(AssetsController);
      store = module.get<AssetStore>(AssetStore);
    });

    it('should return metadata for existing txid', () => {
      const mockData: AssetMetadata = {
        dna: 'a'.repeat(64) as AssetMetadata['dna'],
        generation: 0,
        cooldownBlock: 100,
        lastFedBlock: 50,
        xp: 0,
        parents: [],
      };

      store.saveMetadata('tx1', mockData);

      const result = controller.getMetadata('tx1');
      expect(result).toEqual(mockData);
    });

    it('should return null for non-existent txid', () => {
      // Controller returns null (200 OK) instead of 404 - "not an asset" is a valid state for a VTXO
      const result = controller.getMetadata('bad_id');
      expect(result).toBeNull();
    });
  });
});

