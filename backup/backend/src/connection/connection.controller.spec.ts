import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionController } from './connection.controller';
import { ConnectionService } from './connection.service';
import { BadRequestException } from '@nestjs/common';

describe('ConnectionController', () => {
  let controller: ConnectionController;
  let service: jest.Mocked<ConnectionService>;

  beforeEach(async () => {
    const mockService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      testConnectionById: jest.fn(),
      testConnection: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConnectionController],
      providers: [
        {
          provide: ConnectionService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ConnectionController>(ConnectionController);
    service = module.get(ConnectionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('testExistingConnection', () => {
    it('should return success message if connection is successful', async () => {
      service.testConnectionById.mockResolvedValue(true);

      const result = await controller.testExistingConnection('1');
      expect(result).toEqual({ message: 'Connection successful' });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(service.testConnectionById).toHaveBeenCalledWith('1');
    });

    it('should throw BadRequestException if connection fails', async () => {
      service.testConnectionById.mockResolvedValue(false);

      await expect(controller.testExistingConnection('1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
