const request = require('supertest');
const app = require('../src/app');
const taskService = require('../src/services/taskService');

const createTask = async (overrides = {}) => {
    const response = await request(app)
        .post('/tasks')
        .send({ title: 'Integration test task', ...overrides });

    expect(response.status).toBe(201);
    return response.body;
};

beforeEach(() => {
    taskService._reset();
});

describe('GET /tasks', () => {
    test('returns all tasks', async () => {
        const firstTask = await createTask({ title: 'First task' });
        const secondTask = await createTask({ title: 'Second task' });

        const response = await request(app).get('/tasks');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([firstTask, secondTask]);
    });

    test('returns an empty array when the store is empty', async () => {
        const response = await request(app).get('/tasks');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    test('returns a one-item array when the store contains one task', async () => {
        const task = await createTask({ title: 'Single task' });

        const response = await request(app).get('/tasks');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([task]);
    });
});

describe('GET /tasks with status filter', () => {
    test('returns tasks matching the requested status', async () => {
        const todoTask = await createTask({ title: 'Todo task', status: 'todo' });
        await createTask({ title: 'In-progress task', status: 'in_progress' });

        const response = await request(app).get('/tasks?status=todo');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([todoTask]);
    });

    test('returns an empty array when no tasks match the status', async () => {
        await createTask({ title: 'Todo task', status: 'todo' });

        const response = await request(app).get('/tasks?status=done');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    test('does not return tasks when the status query only matches part of a status', async () => {
        await createTask({ title: 'In-progress task', status: 'in_progress' });

        const response = await request(app).get('/tasks?status=progress');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });
});

describe('GET /tasks with pagination', () => {
    test('returns the requested first page', async () => {
        const firstTask = await createTask({ title: 'First task' });
        const secondTask = await createTask({ title: 'Second task' });
        await createTask({ title: 'Third task' });

        const response = await request(app).get('/tasks?page=1&limit=2');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([firstTask, secondTask]);
    });

    test('filters by status and applies pagination together', async () => {
        const firstTodo = await createTask({ title: 'First todo', status: 'todo' });
        const secondTodo = await createTask({ title: 'Second todo', status: 'todo' });
        await createTask({ title: 'Third todo', status: 'todo' });
        await createTask({ title: 'In-progress task', status: 'in_progress' });

        const response = await request(app)
            .get('/tasks?status=todo&page=1&limit=2');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([firstTodo, secondTodo]);
    });

    test('returns an empty array when the requested page is beyond available tasks', async () => {
        await createTask({ title: 'Only task' });

        const response = await request(app).get('/tasks?page=5&limit=2');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([]);
    });

    test('returns all remaining tasks when the limit exceeds the task count', async () => {
        const firstTask = await createTask({ title: 'First task' });
        const secondTask = await createTask({ title: 'Second task' });

        const response = await request(app).get('/tasks?page=1&limit=10');

        expect(response.status).toBe(200);
        expect(response.body).toEqual([firstTask, secondTask]);
    });
});



describe('POST /tasks', () => {
    test('creates a task and returns its fields', async () => {
        const response = await request(app).post('/tasks').send({
            title: 'New task',
            description: 'Created through the API',
            status: 'todo',
            priority: 'high',
        });

        expect(response.status).toBe(201);
        expect(response.body).toMatchObject({
            title: 'New task',
            description: 'Created through the API',
            status: 'todo',
            priority: 'high',
            dueDate: null,
            completedAt: null,
        });
        expect(response.body.id).toEqual(expect.any(String));

        const listResponse = await request(app).get('/tasks');
        expect(listResponse.body).toContainEqual(response.body);
    });

    test('rejects a request without a title', async () => {
        const response = await request(app).post('/tasks').send({ description: 'Missing title' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: 'title is required and must be a non-empty string',
        });
    });

    test('rejects a task with an unsupported status', async () => {
        const response = await request(app).post('/tasks').send({
            title: 'Invalid status task',
            status: 'blocked',
        });

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('status must be one of: todo, in_progress, done');
    });
});

describe('PUT /tasks/:id', () => {
    test('updates a task and returns the updated task', async () => {
        const task = await createTask({ title: 'Before update' });

        const response = await request(app)
            .put(`/tasks/${task.id}`)
            .send({ title: 'After update', description: 'Updated through the API' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            id: task.id,
            title: 'After update',
            description: 'Updated through the API',
        });

        const listResponse = await request(app).get('/tasks');
        expect(listResponse.body).toContainEqual(response.body);
    });

    test('returns 404 when the task does not exist', async () => {
        const response = await request(app)
            .put('/tasks/missing-task-id')
            .send({ title: 'Updated title' });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Task not found' });
    });

    test('rejects an empty title', async () => {
        const task = await createTask();

        const response = await request(app).put(`/tasks/${task.id}`).send({ title: '  ' });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'title must be a non-empty string' });
    });
});

describe('DELETE /tasks/:id', () => {
    test('deletes a task and returns no content', async () => {
        const task = await createTask();

        const response = await request(app).delete(`/tasks/${task.id}`);

        expect(response.status).toBe(204);
        const listResponse = await request(app).get('/tasks');
        expect(listResponse.body).toEqual([]);
    });

    test('returns 404 when the task does not exist', async () => {
        const response = await request(app).delete('/tasks/missing-task-id');

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Task not found' });
    });

    test('returns 404 when deleting the same task a second time', async () => {
        const task = await createTask();
        const firstResponse = await request(app).delete(`/tasks/${task.id}`);
        const secondResponse = await request(app).delete(`/tasks/${task.id}`);

        expect(firstResponse.status).toBe(204);
        expect(secondResponse.status).toBe(404);
        expect(secondResponse.body).toEqual({ error: 'Task not found' });
    });
});

describe('PATCH /tasks/:id/complete', () => {
    test('marks a task as complete and returns it', async () => {
        const task = await createTask({ title: 'Task to complete' });

        const response = await request(app).patch(`/tasks/${task.id}/complete`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            id: task.id,
            title: task.title,
            status: 'done',
            completedAt: expect.any(String),
        });
        expect(Number.isNaN(Date.parse(response.body.completedAt))).toBe(false);

        const listResponse = await request(app).get('/tasks');
        expect(listResponse.body).toContainEqual(response.body);
    });

    test('returns 404 when the task does not exist', async () => {
        const response = await request(app).patch('/tasks/missing-task-id/complete');

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Task not found' });
    });

    test('returns a successful completed response when the task is already done', async () => {
        const task = await createTask({ title: 'Already done task', status: 'done' });

        const response = await request(app).patch(`/tasks/${task.id}/complete`);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            id: task.id,
            status: 'done',
            completedAt: expect.any(String),
        });
        expect(Number.isNaN(Date.parse(response.body.completedAt))).toBe(false);
    });
});

describe('GET /tasks/stats', () => {
    test('returns status counts and the overdue count', async () => {
        await createTask({ title: 'Overdue task', dueDate: '2000-01-01T00:00:00.000Z' });
        await createTask({
            title: 'Completed task',
            status: 'done',
            dueDate: '2000-01-01T00:00:00.000Z',
        });
        await createTask({ title: 'In-progress task', status: 'in_progress' });

        const response = await request(app).get('/tasks/stats');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            todo: 1,
            in_progress: 1,
            done: 1,
            overdue: 1,
        });
    });

    test('returns zero counts when there are no tasks', async () => {
        const response = await request(app).get('/tasks/stats');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            todo: 0,
            in_progress: 0,
            done: 0,
            overdue: 0,
        });
    });

    test('does not count a task due at the current instant as overdue', async () => {
        const now = new Date('2026-10-01T12:00:00.000Z');
        jest.useFakeTimers().setSystemTime(now);

        try {
            await createTask({ title: 'Task due now', dueDate: now.toISOString() });

            const response = await request(app).get('/tasks/stats');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                todo: 1,
                in_progress: 0,
                done: 0,
                overdue: 0,
            });
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('PATCH /tasks/:id/assign', () => {
    test('assigns a task and persists the assignee', async () => {
        const task = await createTask({ title: 'Task to assign' });

        const response = await request(app)
            .patch(`/tasks/${task.id}/assign`)
            .send({ assignee: 'John' });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ id: task.id, assignee: 'John' });

        const listResponse = await request(app).get('/tasks');
        expect(listResponse.body).toContainEqual(response.body);
    });

    test('returns 404 when the task does not exist', async () => {
        const response = await request(app)
            .patch('/tasks/missing-task-id/assign')
            .send({ assignee: 'John' });

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Task not found' });
    });

    test('rejects a request without an assignee', async () => {
        const response = await request(app)
            .patch('/tasks/missing-task-id/assign')
            .send({});

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'assignee must be a non-empty string' });
    });

    test.each([
        ['empty string', ''],
        ['whitespace-only string', '   '],
        ['number', 123],
        ['null', null],
    ])('rejects an assignee that is a %s', async (_description, assignee) => {
        const response = await request(app)
            .patch('/tasks/missing-task-id/assign')
            .send({ assignee });

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'assignee must be a non-empty string' });
    });

    test('rejects reassignment and preserves the original assignee', async () => {
        const task = await createTask({ title: 'Already assigned task' });
        const firstResponse = await request(app)
            .patch(`/tasks/${task.id}/assign`)
            .send({ assignee: 'John' });

        expect(firstResponse.status).toBe(200);

        const secondResponse = await request(app)
            .patch(`/tasks/${task.id}/assign`)
            .send({ assignee: 'Mike' });

        expect(secondResponse.status).toBe(400);
        expect(secondResponse.body).toEqual({ error: 'Task is already assigned' });

        const listResponse = await request(app).get('/tasks');
        expect(listResponse.body).toContainEqual(expect.objectContaining({
            id: task.id,
            assignee: 'John',
        }));
    });
});
