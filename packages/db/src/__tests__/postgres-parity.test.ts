import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { PostgresUserRepository } from '../repositories/postgres-user-repository';
import { PostgresIdentityRepository } from '../repositories/postgres-identity-repository';
import { PostgresProductivityRepository } from '../repositories/postgres-productivity-repository';
import { PostgresInventoryRepository } from '../repositories/postgres-inventory-repository';
import { PostgresGardenRepository } from '../repositories/postgres-garden-repository';
import { PostgresPetRepository } from '../repositories/postgres-pet-repository';
import * as schema from '../schema';

// Runs only against a disposable test database, e.g.
// POSTGRES_TEST_URL=postgres://pomo:pomo@localhost:5434/pomotest npx jest
// Never point this at production: the tests write rows.
const TEST_URL = process.env.POSTGRES_TEST_URL;
const describeIfPostgres = TEST_URL ? describe : describe.skip;

let sql: postgres.Sql;
let db: any;

beforeAll(async () => {
    if (!TEST_URL) return;
    sql = postgres(TEST_URL);
    db = drizzle(sql, { schema });
});

afterAll(async () => {
    await sql?.end();
});

// Helper to get a fresh user UUID for each test
async function freshUser(discordId: string): Promise<string> {
    const identityRepo = new PostgresIdentityRepository(db);
    const { userId } = await identityRepo.resolveIdentity('discord', discordId);
    return userId;
}

describeIfPostgres('PostgreSQL Adapters Parity Tests', () => {
    it('UserRepository creates and retrieves user', async () => {
        const userId = await freshUser('par_test_user_1');
        const userRepo = new PostgresUserRepository(db);
        const user = await userRepo.getUser(userId);
        expect(user).not.toBeNull();
        expect(user!.water).toBe(0);
        expect(user!.xp).toBe(0);
    });

    it('UserRepository increments XP and season_xp atomically', async () => {
        const userId = await freshUser('par_test_user_1b');
        const userRepo = new PostgresUserRepository(db);
        await userRepo.incrementField(userId, 'xp', 100);
        const user = await userRepo.getUser(userId);
        expect(user!.xp).toBe(100);
        expect(user!.season_xp).toBe(100);
    });

    it('UserRepository deductWaterAtomic prevents negative balance', async () => {
        const userId = await freshUser('par_test_user_1c');
        const userRepo = new PostgresUserRepository(db);
        // No water to start — should fail
        const failed = await userRepo.deductWaterAtomic(userId, 5);
        expect(failed).toBe(false);
    });

    it('InventoryRepository adds and retrieves items', async () => {
        const userId = await freshUser('par_test_user_2');
        const inventoryRepo = new PostgresInventoryRepository(db);

        await inventoryRepo.addItem(userId, 'tomato', 3);
        const items = await inventoryRepo.listItems(userId);
        expect(items.length).toBe(1);
        expect(items[0].item_key).toBe('tomato');
        expect(items[0].quantity).toBe(3);

        // upsert adds quantity
        await inventoryRepo.addItem(userId, 'tomato', 2);
        const updated = await inventoryRepo.getItem(userId, 'tomato');
        expect(updated!.quantity).toBe(5);

        // Remove
        const removed = await inventoryRepo.removeItem(userId, 'tomato', 5);
        expect(removed).toBe(true);
        const empty = await inventoryRepo.listItems(userId);
        expect(empty.length).toBe(0);
    });

    it('ProductivityRepository manages tasks lifecycle', async () => {
        const userId = await freshUser('par_test_user_3');
        const taskRepo = new PostgresProductivityRepository(db);

        const result = await taskRepo.createTask(userId, 'Test Task 1');
        expect(result.success).toBe(true);
        const taskId = result.task!.id;

        const active = await taskRepo.listTasks(userId, true);
        expect(active.length).toBe(1);
        expect(active[0].content).toBe('Test Task 1');

        await taskRepo.completeTask(userId, taskId);
        const afterComplete = await taskRepo.listTasks(userId, true);
        expect(afterComplete.length).toBe(0);

        const all = await taskRepo.listTasks(userId, false);
        expect(all.length).toBe(1);
        expect(all[0].completed).toBe(true);
    });

    it('GardenRepository plants and removes plots', async () => {
        const userId = await freshUser('par_test_user_4');
        const gardenRepo = new PostgresGardenRepository(db);

        await gardenRepo.plantSeed(userId, 'sunflower');
        const plots = await gardenRepo.getPlots(userId);
        expect(plots.length).toBe(1);
        expect(plots[0].plant_type).toBe('sunflower');

        const plotId = String(plots[0].id);
        await gardenRepo.updatePlot(plotId, 10, 2);
        const updated = await gardenRepo.getPlot(plotId, userId);
        expect(updated!.stage).toBe(2);
        expect(updated!.water_used).toBe(10);

        const removed = await gardenRepo.removePlot(plotId);
        expect(removed).toBe(true);
        const empty = await gardenRepo.getPlots(userId);
        expect(empty.length).toBe(0);
    });

    it('PetRepository manages pets and XP', async () => {
        const userId = await freshUser('par_test_user_5');
        const petRepo = new PostgresPetRepository(db);

        await petRepo.addPet(userId, 'cat', true);
        const pets = await petRepo.getOwnedPets(userId);
        expect(pets.length).toBe(1);
        expect(pets[0].pet_key).toBe('cat');

        const active = await petRepo.getActivePet(userId);
        expect(active).not.toBeNull();
        expect(active!.pet_key).toBe('cat');

        const xpResult = await petRepo.awardPetXP(userId, 25);
        expect(xpResult).not.toBeNull();
        expect(xpResult!.effectiveXP).toBe(25);
    });
});
