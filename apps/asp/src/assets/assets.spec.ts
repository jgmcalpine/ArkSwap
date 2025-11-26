import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AssetStore } from './asset.store';
import { AssetsController } from './assets.controller';
import { RoundService } from '../round.service';
import { VtxoStore } from '../vtxo-store.service';
import { TransferService } from '../transfer.service';
import { BitcoinService } from '../bitcoin/bitcoin.service';
import { SignatureVerifierService } from './signature-verifier.service';
import type { AssetMetadata, Vtxo } from '@arkswap/protocol';
import { asAddress, asTxId } from '@arkswap/protocol';

// Mock the protocol package's createAssetPayToPublicKey to avoid dependency issues
// We'll create deterministic addresses based on pubkey and metadata
jest.mock('@arkswap/protocol', () => {
  const actual = jest.requireActual('@arkswap/protocol');
  return {
    ...actual,
    createAssetPayToPublicKey: jest.fn((pubkey: Buffer, metadata: AssetMetadata) => {
      // Create a deterministic address based on pubkey (first 4 bytes) and DNA for testing
      // This ensures the same pubkey + metadata always produces the same address
      // Different pubkeys will produce different addresses
      const pubkeyHash = pubkey.toString('hex').slice(0, 8);
      const dnaHash = metadata.dna.slice(0, 8);
      return `bcrt1p${pubkeyHash}${dnaHash}${'0'.repeat(44)}`;
    }),
  };
});

// Import after mock
import { createAssetPayToPublicKey } from '@arkswap/protocol';

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
    let vtxoStore: jest.Mocked<VtxoStore>;
    let roundService: jest.Mocked<RoundService>;
    let bitcoinService: jest.Mocked<BitcoinService>;
    let signatureVerifier: jest.Mocked<SignatureVerifierService>;

    beforeEach(async () => {
      // Create mocks
      const mockVtxoStore = {
        getVtxo: jest.fn(),
        markSpent: jest.fn(),
        addVtxo: jest.fn(),
      };

      const mockRoundService = {
        scheduleLift: jest.fn(),
      };

      const mockBitcoinService = {
        getBlockHeight: jest.fn().mockResolvedValue(1000),
      };

      const mockSignatureVerifier = {
        verifySignatureFromPubkey: jest.fn().mockReturnValue(true),
        verifySignatureFromAddress: jest.fn().mockReturnValue(true),
      };

      const module: TestingModule = await Test.createTestingModule({
        controllers: [AssetsController],
        providers: [
          AssetStore,
          {
            provide: VtxoStore,
            useValue: mockVtxoStore,
          },
          {
            provide: RoundService,
            useValue: mockRoundService,
          },
          {
            provide: TransferService,
            useValue: {},
          },
          {
            provide: BitcoinService,
            useValue: mockBitcoinService,
          },
          {
            provide: SignatureVerifierService,
            useValue: mockSignatureVerifier,
          },
        ],
      }).compile();

      controller = module.get<AssetsController>(AssetsController);
      store = module.get<AssetStore>(AssetStore);
      vtxoStore = module.get(VtxoStore) as jest.Mocked<VtxoStore>;
      roundService = module.get(RoundService) as jest.Mocked<RoundService>;
      bitcoinService = module.get(BitcoinService) as jest.Mocked<BitcoinService>;
      signatureVerifier = module.get(SignatureVerifierService) as jest.Mocked<SignatureVerifierService>;
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
      const result = controller.getMetadata('bad_id');
      expect(result).toBeNull();
    });

    describe('breed', () => {
      const userPubkey = 'a'.repeat(64);
      const signature = 'b'.repeat(128); // 128 hex chars = 64 bytes

      let parent1Id: string;
      let parent2Id: string;
      let parent1Metadata: AssetMetadata;
      let parent2Metadata: AssetMetadata;
      let parent1Vtxo: Vtxo;
      let parent2Vtxo: Vtxo;

      beforeEach(() => {
        // Create Parent A (1000 sats, Gen 0)
        parent1Id = 'parent1_txid';
        parent1Metadata = {
          dna: 'a'.repeat(64) as AssetMetadata['dna'],
          generation: 0,
          cooldownBlock: 100,
          lastFedBlock: 50,
          xp: 0,
          parents: [],
        };

        // Create Parent B (1500 sats, Gen 0)
        parent2Id = 'parent2_txid';
        parent2Metadata = {
          dna: 'b'.repeat(64) as AssetMetadata['dna'],
          generation: 0,
          cooldownBlock: 100,
          lastFedBlock: 50,
          xp: 0,
          parents: [],
        };

        // Store metadata in AssetStore
        store.saveMetadata(parent1Id, parent1Metadata);
        store.saveMetadata(parent2Id, parent2Metadata);

        // Create addresses that will match when controller recreates them
        const userPubkeyBuffer = Buffer.from(userPubkey, 'hex');
        const parent1Address = createAssetPayToPublicKey(userPubkeyBuffer, parent1Metadata);
        const parent2Address = createAssetPayToPublicKey(userPubkeyBuffer, parent2Metadata);

        parent1Vtxo = {
          txid: asTxId(parent1Id),
          vout: 0,
          amount: 1000,
          address: asAddress(parent1Address),
          spent: false,
        };

        parent2Vtxo = {
          txid: asTxId(parent2Id),
          vout: 0,
          amount: 1500,
          address: asAddress(parent2Address),
          spent: false,
        };

        // Setup mocks
        vtxoStore.getVtxo.mockImplementation((txid: string, vout: number) => {
          if (txid === parent1Id && vout === 0) return parent1Vtxo;
          if (txid === parent2Id && vout === 0) return parent2Vtxo;
          return undefined;
        });

        vtxoStore.markSpent.mockImplementation((txid: string, vout: number) => {
          if (txid === parent1Id && vout === 0) {
            parent1Vtxo.spent = true;
          }
          if (txid === parent2Id && vout === 0) {
            parent2Vtxo.spent = true;
          }
        });
      });

      it('should breed two parents successfully', async () => {
        // Arrange: Parents are already set up in beforeEach

        // Act
        const result = await controller.breed({
          parent1Id,
          parent2Id,
          userPubkey,
          signature,
        });

        // Assert: Parents are burned (markSpent called twice)
        expect(vtxoStore.markSpent).toHaveBeenCalledTimes(2);
        expect(vtxoStore.markSpent).toHaveBeenCalledWith(parent1Id, 0);
        expect(vtxoStore.markSpent).toHaveBeenCalledWith(parent2Id, 0);

        // Assert: Child is minted via scheduleLift
        expect(roundService.scheduleLift).toHaveBeenCalledTimes(1);

        // Get the call arguments
        const [childAddress, childValue, childMetadata] = roundService.scheduleLift.mock.calls[0];

        // Assert: Child value is sum of parents (Fusion: 1000 + 1500 = 2500)
        expect(childValue).toBe(2500);

        // Assert: Child generation is max(parent1.gen, parent2.gen) + 1
        expect(childMetadata.generation).toBe(1); // max(0, 0) + 1

        // Assert: Child has correct structure
        expect(childMetadata.dna).toBeDefined();
        expect(childMetadata.dna.length).toBe(64);
        expect(childMetadata.xp).toBe(0);
        expect(childMetadata.lastFedBlock).toBe(0);
        expect(childMetadata.parents).toEqual([parent1Id, parent2Id]);

        // Assert: Return value
        expect(result.success).toBe(true);
        expect(result.child.generation).toBe(1);
        expect(result.child.dna).toBeDefined();
      });

      it('should calculate child generation correctly when parents have different generations', async () => {
        // Arrange: Update parent2 to generation 2
        parent2Metadata.generation = 2;
        store.saveMetadata(parent2Id, parent2Metadata);

        // Recreate parent2 address with new metadata
        const userPubkeyBuffer = Buffer.from(userPubkey, 'hex');
        const parent2Address = createAssetPayToPublicKey(userPubkeyBuffer, parent2Metadata);
        parent2Vtxo = {
          ...parent2Vtxo,
          address: asAddress(parent2Address),
        };

        vtxoStore.getVtxo.mockImplementation((txid: string, vout: number) => {
          if (txid === parent1Id && vout === 0) return parent1Vtxo;
          if (txid === parent2Id && vout === 0) return parent2Vtxo;
          return undefined;
        });

        // Act
        await controller.breed({
          parent1Id,
          parent2Id,
          userPubkey,
          signature,
        });

        // Assert: Child generation is max(0, 2) + 1 = 3
        const [, , childMetadata] = roundService.scheduleLift.mock.calls[0];
        expect(childMetadata.generation).toBe(3);
      });

      it('should fail if parent 1 is already spent', async () => {
        // Arrange: Mark parent1 as spent
        parent1Vtxo.spent = true;

        // Act & Assert
        await expect(
          controller.breed({
            parent1Id,
            parent2Id,
            userPubkey,
            signature,
          }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          controller.breed({
            parent1Id,
            parent2Id,
            userPubkey,
            signature,
          }),
        ).rejects.toThrow('Parent 1 VTXO already spent');
      });

      it('should fail if parent 2 is already spent', async () => {
        // Arrange: Mark parent2 as spent
        parent2Vtxo.spent = true;

        // Act & Assert
        await expect(
          controller.breed({
            parent1Id,
            parent2Id,
            userPubkey,
            signature,
          }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          controller.breed({
            parent1Id,
            parent2Id,
            userPubkey,
            signature,
          }),
        ).rejects.toThrow('Parent 2 VTXO already spent');
      });

      it('should fail if parent 1 VTXO not found', async () => {
        // Arrange: Make getVtxo return undefined for parent1
        vtxoStore.getVtxo.mockImplementation((txid: string, vout: number) => {
          if (txid === parent1Id && vout === 0) return undefined;
          if (txid === parent2Id && vout === 0) return parent2Vtxo;
          return undefined;
        });

        // Act & Assert
        await expect(
          controller.breed({
            parent1Id: 'nonexistent',
            parent2Id,
            userPubkey,
            signature,
          }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          controller.breed({
            parent1Id: 'nonexistent',
            parent2Id,
            userPubkey,
            signature,
          }),
        ).rejects.toThrow('Parent 1 VTXO not found');
      });

      it('should fail if parent 2 VTXO not found', async () => {
        // Arrange: Make getVtxo return undefined for parent2
        vtxoStore.getVtxo.mockImplementation((txid: string, vout: number) => {
          if (txid === parent1Id && vout === 0) return parent1Vtxo;
          if (txid === parent2Id && vout === 0) return undefined;
          return undefined;
        });

        // Act & Assert
        await expect(
          controller.breed({
            parent1Id,
            parent2Id: 'nonexistent',
            userPubkey,
            signature,
          }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          controller.breed({
            parent1Id,
            parent2Id: 'nonexistent',
            userPubkey,
            signature,
          }),
        ).rejects.toThrow('Parent 2 VTXO not found');
      });

      it('should fail if parent 1 asset not found', async () => {
        // Arrange: Remove parent1 metadata
        // We can't directly remove, but we can test with a different txid that has no metadata
        const fakeParent1Id = 'fake_parent1';
        const fakeVtxo: Vtxo = {
          txid: asTxId(fakeParent1Id),
          vout: 0,
          amount: 1000,
          address: asAddress('bcrt1p' + '0'.repeat(58)),
          spent: false,
        };

        vtxoStore.getVtxo.mockImplementation((txid: string, vout: number) => {
          if (txid === fakeParent1Id && vout === 0) return fakeVtxo;
          if (txid === parent2Id && vout === 0) return parent2Vtxo;
          return undefined;
        });

        // Act & Assert
        await expect(
          controller.breed({
            parent1Id: fakeParent1Id,
            parent2Id,
            userPubkey,
            signature,
          }),
        ).rejects.toThrow(BadRequestException);
      });

      it('should fail if signature verification fails', async () => {
        // Arrange: Mock signature verifier to return false
        signatureVerifier.verifySignatureFromPubkey.mockReturnValue(false);

        // Act & Assert
        await expect(
          controller.breed({
            parent1Id,
            parent2Id,
            userPubkey,
            signature,
          }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          controller.breed({
            parent1Id,
            parent2Id,
            userPubkey,
            signature,
          }),
        ).rejects.toThrow('Invalid Schnorr signature');
      });

      it('should fail if ownership verification fails (address mismatch)', async () => {
        // Arrange: Create parent with different address (different pubkey)
        const differentPubkey = 'c'.repeat(64);
        const differentPubkeyBuffer = Buffer.from(differentPubkey, 'hex');
        const differentAddress = createAssetPayToPublicKey(differentPubkeyBuffer, parent1Metadata);
        const wrongParent1Vtxo = {
          ...parent1Vtxo,
          address: asAddress(differentAddress),
        };

        vtxoStore.getVtxo.mockImplementation((txid: string, vout: number) => {
          if (txid === parent1Id && vout === 0) return wrongParent1Vtxo;
          if (txid === parent2Id && vout === 0) return parent2Vtxo;
          return undefined;
        });

        // Act & Assert
        await expect(
          controller.breed({
            parent1Id,
            parent2Id,
            userPubkey,
            signature,
          }),
        ).rejects.toThrow(BadRequestException);

        await expect(
          controller.breed({
            parent1Id,
            parent2Id,
            userPubkey,
            signature,
          }),
        ).rejects.toThrow('Parent 1 ownership verification failed');
      });
    });
  });
});
