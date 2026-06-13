import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionService } from './connection.service';
import { ConnectionRepository } from './repositories/connection.repository.interface';
import { DatabaseType, Environment } from './dto/create-connection.dto';
import { NotFoundException } from '@nestjs/common';
import { ConnectionEntity } from './entities/connection.entity';

describe('ConnectionService', () => {
  let service: ConnectionService;
  let repository: jest.Mocked<ConnectionRepository>;

  const mockConnection: ConnectionEntity = {
    id: '1',
    name: 'Test DB',
    type: DatabaseType.MARIADB,
    environment: Environment.LOCAL,
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'password',
    database: 'test',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionService,
        {
          provide: 'ConnectionRepository',
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<ConnectionService>(ConnectionService);
    repository = module.get('ConnectionRepository');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('testConnectionById', () => {
    it('should throw NotFoundException if connection does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.testConnectionById('999')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return false if driver fails to connect', async () => {
      repository.findById.mockResolvedValue(mockConnection);

      // Mock getDriver to return a driver that fails
      const mockDriver = {
        connect: jest.fn().mockRejectedValue(new Error('Connection failed')),
        disconnect: jest.fn(),
        executeQuery: jest.fn(),
        getTables: jest.fn(),
        getColumns: jest.fn(),
        getDDL: jest.fn(),
      };

      jest.spyOn(service, 'getDriver').mockReturnValue(mockDriver);

      const result = await service.testConnectionById('1');
      expect(result).toBe(false);
      expect(mockDriver.connect).toHaveBeenCalled();
    });

    it('should return true if driver connects successfully', async () => {
      repository.findById.mockResolvedValue(mockConnection);

      const mockDriver = {
        connect: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn().mockResolvedValue(undefined),
        executeQuery: jest.fn(),
        getTables: jest.fn(),
        getColumns: jest.fn(),
        getDDL: jest.fn(),
      };

      jest.spyOn(service, 'getDriver').mockReturnValue(mockDriver);

      const result = await service.testConnectionById('1');
      expect(result).toBe(true);
      expect(mockDriver.connect).toHaveBeenCalled();
      expect(mockDriver.disconnect).toHaveBeenCalled();
    });
  });
});
