const taskService = require('../src/services/taskService');

describe('taskService', () => {
	beforeEach(() => {
		taskService._reset();
	});

	// Task creation
	test('create uses the default values when only a title is provided', () => {
		const task = taskService.create({ title: 'Write unit tests' });

		expect(task).toMatchObject({
			title: 'Write unit tests',
			description: '',
			status: 'todo',
			priority: 'medium',
			dueDate: null,
			completedAt: null,
		});
		expect(task.id).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);
		expect(Number.isNaN(Date.parse(task.createdAt))).toBe(false);
	});

	test('create preserves explicitly provided task fields', () => {
		const dueDate = '2026-10-01T12:00:00.000Z';

		const task = taskService.create({
			title: 'Review tests',
			description: 'Check the service behavior',
			status: 'in_progress',
			priority: 'high',
			dueDate,
		});

		expect(task).toMatchObject({
			title: 'Review tests',
			description: 'Check the service behavior',
			status: 'in_progress',
			priority: 'high',
			dueDate,
		});
	});

	test('create assigns a distinct ID to each task', () => {
		const firstTask = taskService.create({ title: 'First task' });
		const secondTask = taskService.create({ title: 'Second task' });

		expect(firstTask.id).not.toBe(secondTask.id);
	});

	// Task retrieval and filtering
	test('getAll returns all tasks in the store', () => {
		const firstTask = taskService.create({ title: 'First task' });
		const secondTask = taskService.create({ title: 'Second task' });

		expect(taskService.getAll()).toEqual([firstTask, secondTask]);
	});

	test('getAll returns a copy of the task list', () => {
		const task = taskService.create({ title: 'Stored task' });
		const tasks = taskService.getAll();

		tasks.pop();

		expect(taskService.getAll()).toEqual([task]);
	});

	test('findById returns the task with the matching ID', () => {
		const task = taskService.create({ title: 'Find this task' });

		expect(taskService.findById(task.id)).toEqual(task);
	});

	test('findById returns undefined when the ID does not exist', () => {
		expect(taskService.findById('missing-task-id')).toBeUndefined();
	});

	test('getByStatus returns only tasks with the requested status', () => {
		const todoTask = taskService.create({ title: 'Todo task', status: 'todo' });
		taskService.create({ title: 'In-progress task', status: 'in_progress' });

		expect(taskService.getByStatus('todo')).toEqual([todoTask]);
	});

	test('getByStatus returns an empty array when no tasks match', () => {
		taskService.create({ title: 'Todo task', status: 'todo' });

		expect(taskService.getByStatus('done')).toEqual([]);
	});

	test('getByStatus does not match a partial status string', () => {
		taskService.create({ title: 'In-progress task', status: 'in_progress' });

		expect(taskService.getByStatus('progress')).toEqual([]);
	});

	test('getPaginated returns the first page when page is 1', () => {
		const firstTask = taskService.create({ title: 'First task' });
		const secondTask = taskService.create({ title: 'Second task' });
		taskService.create({ title: 'Third task' });

		expect(taskService.getPaginated(1, 2)).toEqual([firstTask, secondTask]);
	});

	test('getPaginated returns an empty array when there are no tasks', () => {
		expect(taskService.getPaginated(1, 10)).toEqual([]);
	});

	test('getPaginated returns the next page without repeating earlier tasks', () => {
		taskService.create({ title: 'First task' });
		taskService.create({ title: 'Second task' });
		const thirdTask = taskService.create({ title: 'Third task' });
		const fourthTask = taskService.create({ title: 'Fourth task' });

		expect(taskService.getPaginated(2, 2)).toEqual([thirdTask, fourthTask]);
	});

	test('getPaginated returns an empty array when the page is beyond available tasks', () => {
		taskService.create({ title: 'First task' });
		taskService.create({ title: 'Second task' });

		expect(taskService.getPaginated(3, 2)).toEqual([]);
	});

	test('getPaginated returns all available tasks when the limit exceeds the task count', () => {
		const firstTask = taskService.create({ title: 'First task' });
		const secondTask = taskService.create({ title: 'Second task' });

		expect(taskService.getPaginated(1, 10)).toEqual([firstTask, secondTask]);
	});

	test('getStats counts task statuses and excludes completed overdue tasks', () => {
		taskService.create({ title: 'Overdue task', dueDate: '2000-01-01T00:00:00.000Z' });
		taskService.create({
			title: 'Completed task',
			status: 'done',
			dueDate: '2000-01-01T00:00:00.000Z',
		});

		expect(taskService.getStats()).toEqual({
			todo: 1,
			in_progress: 0,
			done: 1,
			overdue: 1,
		});
	});

	test('getStats returns zero counts when the store is empty', () => {
		expect(taskService.getStats()).toEqual({
			todo: 0,
			in_progress: 0,
			done: 0,
			overdue: 0,
		});
	});

	test('getStats does not count future due dates as overdue', () => {
		taskService.create({
			title: 'Future task',
			dueDate: '2999-12-31T23:59:59.000Z',
		});

		expect(taskService.getStats()).toEqual({
			todo: 1,
			in_progress: 0,
			done: 0,
			overdue: 0,
		});
	});

	test('getStats does not count a task due at the current instant as overdue', () => {
		const now = new Date('2026-10-01T12:00:00.000Z');
		jest.useFakeTimers().setSystemTime(now);

		try {
			taskService.create({ title: 'Task due now', dueDate: now.toISOString() });

			expect(taskService.getStats()).toEqual({
				todo: 1,
				in_progress: 0,
				done: 0,
				overdue: 0,
			});
		} finally {
			jest.useRealTimers();
		}
	});

	test('getStats counts in-progress tasks', () => {
		taskService.create({ title: 'First active task', status: 'in_progress' });
		taskService.create({ title: 'Second active task', status: 'in_progress' });

		expect(taskService.getStats()).toEqual({
			todo: 0,
			in_progress: 2,
			done: 0,
			overdue: 0,
		});
	});

	// Task updates and removal
	test('update changes supplied fields and preserves the other task fields', () => {
		const task = taskService.create({ title: 'Original title' });

		const updatedTask = taskService.update(task.id, { description: 'Updated description' });

		expect(updatedTask).toMatchObject({
			id: task.id,
			title: 'Original title',
			description: 'Updated description',
			status: 'todo',
			priority: 'medium',
		});
		expect(taskService.findById(task.id)).toEqual(updatedTask);
	});

	test('update with no fields leaves the task unchanged', () => {
		const task = taskService.create({ title: 'Unchanged task' });

		const updatedTask = taskService.update(task.id, {});

		expect(updatedTask).toEqual(task);
		expect(taskService.findById(task.id)).toEqual(task);
	});

	test('update returns null when the task ID does not exist', () => {
		expect(taskService.update('missing-task-id', { title: 'Updated title' })).toBeNull();
		expect(taskService.getAll()).toEqual([]);
	});

	test('remove deletes an existing task and returns true', () => {
		const task = taskService.create({ title: 'Task to remove' });

		expect(taskService.remove(task.id)).toBe(true);
		expect(taskService.getAll()).toEqual([]);
	});

	test('remove returns false when the task ID does not exist', () => {
		const task = taskService.create({ title: 'Keep this task' });

		expect(taskService.remove('missing-task-id')).toBe(false);
		expect(taskService.getAll()).toEqual([task]);
	});

	test('remove leaves other tasks in the store untouched', () => {
		const firstTask = taskService.create({ title: 'Keep this task' });
		const taskToRemove = taskService.create({ title: 'Remove this task' });
		const thirdTask = taskService.create({ title: 'Keep this task too' });

		taskService.remove(taskToRemove.id);

		expect(taskService.getAll()).toEqual([firstTask, thirdTask]);
	});

	// Task completion
	test('completeTask marks an existing task as done and stores its completion timestamp', () => {
		const task = taskService.create({ title: 'Task to complete', priority: 'high' });

		const completedTask = taskService.completeTask(task.id);

		expect(completedTask).toMatchObject({
			id: task.id,
			status: 'done',
			priority: 'high',
			completedAt: expect.any(String),
		});
		expect(Number.isNaN(Date.parse(completedTask.completedAt))).toBe(false);
		expect(taskService.findById(task.id)).toEqual(completedTask);
	});

	test('completeTask leaves an already completed task unchanged', () => {
		const completedAt = '2025-01-01T12:00:00.000Z';
		const task = taskService.create({
			title: 'Already completed task',
			status: 'done',
			priority: 'high',
		});
		const alreadyCompletedTask = taskService.update(task.id, { completedAt });

		expect(taskService.completeTask(task.id)).toEqual(alreadyCompletedTask);
	});

	test('completeTask returns null when the task ID does not exist', () => {
		expect(taskService.completeTask('missing-task-id')).toBeNull();
	});

	// Task assignment
	test('assignTask assigns a task and returns it with the assignee', () => {
		const task = taskService.create({ title: 'Task to assign' });

		const assignedTask = taskService.assignTask(task.id, 'John');

		expect(assignedTask).not.toBeNull();
		expect(assignedTask.id).toBe(task.id);
		expect(assignedTask.assignee).toBe('John');
		expect(taskService.findById(task.id)).toEqual(assignedTask);
	});

	test('assignTask returns null when the task does not exist', () => {
		expect(taskService.assignTask('missing-id', 'John')).toBeNull();
	});

	test('assignTask rejects reassignment without changing the existing assignee', () => {
		const task = taskService.create({ title: 'Already assigned task' });
		taskService.assignTask(task.id, 'John');

		expect(() => taskService.assignTask(task.id, 'Mike')).toThrow('Task is already assigned');
		expect(taskService.findById(task.id).assignee).toBe('John');
	});
});
