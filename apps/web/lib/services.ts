import { 
    isPostgresEnabled, 
    getClient, 
    PostgresSubjectRepository,
    PostgresNoteRepository,
    PostgresGoalRepository,
    PostgresDocumentRepository,
    PostgresProductivityRepository,
    PostgresUserRepository,
    PostgresIdentityRepository
} from '@pomo/db';

let drizzleDb: any = null;

export class PostgresUnavailableError extends Error {
    constructor() {
        super("PostgreSQL is not enabled (DATABASE_URL is unset). Pomo 2.0 productivity features are unavailable.");
        this.name = "PostgresUnavailableError";
    }
}

/**
 * True when DATABASE_URL is configured. Pages/actions that depend on Postgres
 * (todos enrichment, goals, notes, subjects, web rooms) must check this first
 * and degrade gracefully instead of letting getDbClient() throw.
 */
export function isProductivityDbEnabled(): boolean {
    return isPostgresEnabled();
}

export function getDbClient() {
    if (!isPostgresEnabled()) {
        throw new PostgresUnavailableError();
    }
    if (!drizzleDb) {
        drizzleDb = getClient();
    }
    if (!drizzleDb) {
        throw new PostgresUnavailableError();
    }
    return drizzleDb;
}

// Global service singletons
let subjectRepository: PostgresSubjectRepository | null = null;
let noteRepository: PostgresNoteRepository | null = null;
let goalRepository: PostgresGoalRepository | null = null;
let documentRepository: PostgresDocumentRepository | null = null;
let productivityRepository: PostgresProductivityRepository | null = null;
let identityRepository: PostgresIdentityRepository | null = null;
let userRepository: PostgresUserRepository | null = null;

export function getSubjectService() {
    if (!subjectRepository) subjectRepository = new PostgresSubjectRepository(getDbClient());
    return subjectRepository;
}

export function getNoteService() {
    if (!noteRepository) noteRepository = new PostgresNoteRepository(getDbClient());
    return noteRepository;
}

export function getGoalService() {
    if (!goalRepository) goalRepository = new PostgresGoalRepository(getDbClient());
    return goalRepository;
}

export function getDocumentService() {
    if (!documentRepository) documentRepository = new PostgresDocumentRepository(getDbClient());
    return documentRepository;
}

export function getTaskService() {
    if (!productivityRepository) productivityRepository = new PostgresProductivityRepository(getDbClient());
    return productivityRepository;
}

export function getIdentityService() {
    if (!identityRepository) identityRepository = new PostgresIdentityRepository(getDbClient());
    return identityRepository;
}

export function getUserService() {
    if (!userRepository) userRepository = new PostgresUserRepository(getDbClient());
    return userRepository;
}
