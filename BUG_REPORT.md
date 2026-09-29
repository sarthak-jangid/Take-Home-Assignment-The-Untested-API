# Bug Report — Task Manager API

## Overview

During the testing phase of the Task Manager API, I identified several behavioral issues in the existing implementation.

The bugs were discovered through unit tests for the task service and integration tests using Supertest. The tests were written to verify the expected API behavior described in the assignment.

This report documents the bugs that were identified, where they occur, why they are incorrect, how the tests exposed them, and what the expected fix would be.

The assignment specifically requires documenting:

- The expected behavior
- The actual behavior
- How the bug was discovered
- Where the bug exists in the source code
- What a potential fix would look like

I have intentionally separated the bug discovery from the implementation of the fix. Not every discovered bug needs to be fixed for the assignment.

---

# Bug 1 — Status Filter Performs Partial Matching

## Location

**File:** `src/services/taskService.js`

**Function:** `getByStatus()`

Current implementation:

```js
const getByStatus = (status) => tasks.filter((t) => t.status.includes(status));
```

## Expected Behavior

The status filter should return only tasks whose status exactly matches the requested status.

For example, if the API receives:

```http
GET /tasks?status=todo
```

it should return tasks whose status is exactly:

```text
todo
```

Similarly:

```http
GET /tasks?status=in_progress
```

should return only tasks with:

```text
in_progress
```

A partial value such as:

```http
GET /tasks?status=progress
```

should not match `in_progress`.

## Actual Behavior

The implementation uses JavaScript's `.includes()` method:

```js
t.status.includes(status)
```

This performs a substring/partial match rather than an exact comparison.

For example:

```js
'in_progress'.includes('progress')
```

returns:

```js
true
```

Therefore, requesting:

```http
GET /tasks?status=progress
```

incorrectly returns a task whose status is:

```text
in_progress
```

instead of returning an empty array.

## How the Bug Was Discovered

I added an integration test specifically for partial status values:

```js
test('does not return tasks when the status query only matches part of a status', async () => {
    await createTask({
        title: 'In-progress task',
        status: 'in_progress'
    });

    const response = await request(app)
        .get('/tasks?status=progress');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
});
```

The test failed because the API returned the `in_progress` task.

Jest reported that the expected value was:

```js
[]
```

but the actual response contained the task with:

```js
status: 'in_progress'
```

## Why This Is a Bug

The API documentation describes `status` as a filter for a task's status. A status value represents a defined state, so the filter should compare the complete status value rather than a substring.

Partial matching can also produce unexpected results if additional statuses are introduced in the future.

## Potential Fix

Replace `.includes()` with strict equality:

```js
const getByStatus = (status) => tasks.filter((t) => t.status === status);
```

This makes:

```js
'in_progress' === 'progress'
```

false, while:

```js
'in_progress' === 'in_progress'
```

is true.

---

# Bug 2 — Pagination Starts From the Wrong Offset ||  (Bug was fixed ...)

## Location

**File:** `src/services/taskService.js`

**Function:** `getPaginated()`

Current implementation:

```js
const getPaginated = (page, limit) => {
    const offset = page * limit;
    return tasks.slice(offset, offset + limit);
};
```

## Expected Behavior

Pagination normally treats the first page as page `1`.

For example, with three tasks:

```text
Task 1
Task 2
Task 3
```

and:

```text
page = 1
limit = 2
```

the expected result is:

```text
Task 1
Task 2
```

The second page should contain:

```text
Task 3
```

when:

```text
page = 2
limit = 2
```

## Actual Behavior

The implementation calculates the offset as:

```js
page * limit
```

For the first page:

```text
page = 1
limit = 2
```

the calculated offset becomes:

```text
1 * 2 = 2
```

Therefore:

```js
tasks.slice(2, 4)
```

starts from the third task instead of the first task.

As a result, page 1 incorrectly skips the first two tasks.

The second page also calculates:

```text
2 * 2 = 4
```

which can cause the result to be empty even when tasks exist on the expected second page.

## How the Bug Was Discovered

The integration test created three tasks and requested the first page:

```js
const firstTask = await createTask({ title: 'First task' });
const secondTask = await createTask({ title: 'Second task' });
await createTask({ title: 'Third task' });

const response = await request(app)
    .get('/tasks?page=1&limit=2');

expect(response.status).toBe(200);
expect(response.body).toEqual([firstTask, secondTask]);
```

The test failed.

Instead of:

```text
First task
Second task
```

the API returned:

```text
Third task
```

The same problem was also detected by the unit tests for `getPaginated()`.

## Why This Is a Bug

The API accepts page numbers starting from `1`, as shown by the assignment examples:

```http
GET /tasks?page=1&limit=10
```

Therefore, page 1 should start at index `0`.

The current calculation treats page 1 as if it were already the second block of results.

## Potential Fix

The offset should be calculated as:

```js
const offset = (page - 1) * limit;
```

The complete function would become:

```js
const getPaginated = (page, limit) => {
    const offset = (page - 1) * limit;
    return tasks.slice(offset, offset + limit);
};
```

This produces:

```text
page 1 → offset 0
page 2 → offset limit
page 3 → offset 2 * limit
```

which matches normal 1-based pagination.

---

# Bug 3 — Completing a Task Unexpectedly Changes Its Priority

## Location

**File:** `src/services/taskService.js`

**Function:** `completeTask()`

Current implementation:

```js
const updated = {
    ...task,
    priority: 'medium',
    status: 'done',
    completedAt: new Date().toISOString(),
};
```

## Expected Behavior

Completing a task should change its completion-related fields:

```text
status → done
completedAt → current timestamp
```

It should not unexpectedly change unrelated task information such as priority.

For example, if a task is created with:

```js
{
    title: 'Important task',
    priority: 'high'
}
```

then completing it should preserve:

```js
priority: 'high'
```

while changing:

```js
status: 'done'
```

and setting:

```js
completedAt
```

## Actual Behavior

The implementation explicitly sets:

```js
priority: 'medium'
```

every time `completeTask()` is called.

Therefore, a high-priority task becomes a medium-priority task simply because it was completed.

## How the Bug Was Discovered

The unit test for `completeTask()` created a high-priority task and then completed it.

The test expected the priority to remain:

```text
high
```

Jest reported:

```text
Expected priority: "high"
Received priority: "medium"
```

This demonstrates that completing the task modifies data that should not be modified by the operation.

## Why This Is a Bug

Priority describes the importance of a task. Completing the task changes its lifecycle status but does not inherently change its priority.

Changing the priority during completion can cause data loss because the original priority cannot be recovered from the task after completion.

## Potential Fix

Remove the priority modification:

```js
const updated = {
    ...task,
    status: 'done',
    completedAt: new Date().toISOString(),
};
```

This preserves the existing priority while still completing the task.

---

# Bug 4 — Completing an Already Completed Task Changes Its Completion Timestamp

## Location

**File:** `src/services/taskService.js`

**Function:** `completeTask()`

## Expected Behavior

If a task is already completed, calling the complete operation again should not modify its existing completion information.

For example, if a task already contains:

```js
{
    status: 'done',
    completedAt: '2025-01-01T12:00:00.000Z'
}
```

calling:

```http
PATCH /tasks/:id/complete
```

again should leave the existing completion timestamp unchanged.

## Actual Behavior

The current implementation always executes:

```js
completedAt: new Date().toISOString()
```

regardless of the current task status.

Therefore, completing an already completed task replaces the original `completedAt` timestamp with a new timestamp.

The function also resets the priority to:

```js
'medium'
```

because of the same logic described in Bug 3.

## How the Bug Was Discovered

The unit test created a completed task with an existing completion timestamp and then called `completeTask()` again.

The expected task retained:

```text
completedAt: 2025-01-01T12:00:00.000Z
```

but the actual result contained a new timestamp from the current execution time.

Jest therefore reported a difference between the expected and received objects.

## Why This Is a Bug

A completion timestamp normally represents when the task was completed.

Calling the same operation again should not silently rewrite historical information.

This can be particularly problematic if the completion timestamp is used for reporting, statistics, auditing, or sorting.

## Potential Fix

The service should explicitly handle already-completed tasks.

For example:

```js
if (task.status === 'done') {
    return task;
}
```

before creating the updated task.

The remaining completion logic can then update only tasks that have not already been completed.

---

# Bug Discovery Summary

The tests identified four main behavioral issues in the current service implementation:

| Bug | Location | Problem |
|---|---|---|
| Status partial matching | `taskService.js → getByStatus()` | Uses substring matching instead of exact status matching |
| Pagination offset | `taskService.js → getPaginated()` | Page 1 starts at index `limit` instead of index `0` |
| Priority changed on completion | `taskService.js → completeTask()` | Completing a task changes its priority to `medium` |
| Completion timestamp overwritten | `taskService.js → completeTask()` | Re-completing a task replaces its existing timestamp |

These issues were discovered through tests rather than by changing the implementation first. The failing assertions provided concrete evidence of the difference between the expected behavior and the actual behavior.

---

# Testing Approach

The bugs were identified using both unit and integration testing.

## Unit Tests

The task service was tested directly to verify its business logic, including:

- Creating tasks
- Finding tasks
- Filtering tasks by status
- Pagination
- Statistics
- Updating tasks
- Removing tasks
- Completing tasks

These tests were useful for identifying problems directly inside `taskService.js`.

## Integration Tests

Supertest was used to test the HTTP endpoints through the Express application.

The integration tests verified:

- HTTP status codes
- Request handling
- Response bodies
- Filtering
- Pagination
- Validation
- Task creation
- Updating
- Deletion
- Completion
- Statistics

This helped confirm that service-level problems were also visible through the actual API.

---

# Fixing Strategy

The assignment requires fixing at least one discovered bug.

The pagination bug is a clear candidate because it affects a documented API feature and causes both unit and integration tests to fail.

The proposed fix is:

```js
const getPaginated = (page, limit) => {
    const offset = (page - 1) * limit;
    return tasks.slice(offset, offset + limit);
};
```

After applying the fix, the pagination tests should be executed again to confirm that:

```text
page 1 → first set of tasks
page 2 → next set of tasks
page beyond available data → []
```

The remaining bugs can remain documented if they are not selected for the required fix, as the assignment explicitly says that all discovered bugs do not have to be fixed.

---

# Notes

One important observation from testing was that several failures were not caused by incorrect test expectations. The tests exposed actual differences between the documented API behavior and the current implementation.

The test suite therefore served two purposes:

1. Verify existing behavior that should continue working.
2. Identify behavior that does not match the expected API contract.

The discovered issues should be reviewed before the API is considered production-ready.

# Part C — New Feature: Assign Task

## Feature Overview

Implemented a new endpoint to assign a task to a user.

### Endpoint

`PATCH /tasks/:id/assign`

### Request Body

```json
{
  "assignee": "John"
}
```

## Design / Implementation

The feature was implemented across three layers:

### 1. Validation

Added `validateAssignTask()` in `src/utils/validators.js`.

The `assignee` field must:

- Exist in the request body.
- Be a string.
- Not be empty.
- Not contain only whitespace.

Invalid requests return:

```json
{
  "error": "assignee must be a non-empty string"
}
```

with HTTP status `400`.

### 2. Service Logic

Added `assignTask(id, assignee)` to `src/services/taskService.js`.

The service:

1. Finds the task by ID.
2. Returns `null` if the task does not exist.
3. Checks whether the task already has an assignee.
4. Rejects reassignment if an assignee already exists.
5. Creates an updated task containing the `assignee`.
6. Stores the updated task in the in-memory task store.
7. Returns the updated task.

An already-assigned task returns an error:

```text
Task is already assigned
```

The original assignee is preserved.

### 3. API Route

Added:

```text
PATCH /tasks/:id/assign
```

The route:

- Validates the request body.
- Calls `taskService.assignTask()`.
- Returns `404` when the task does not exist.
- Returns `400` when the task is already assigned.
- Returns the updated task with `200` on success.

## Response Examples

### Successful assignment

**Request:**

```http
PATCH /tasks/:id/assign
```

```json
{
  "assignee": "John"
}
```

**Response: `200 OK`**

```json
{
  "id": "task-id",
  "title": "Task to assign",
  "assignee": "John"
}
```

### Task not found

**Response: `404 Not Found`**

```json
{
  "error": "Task not found"
}
```

### Invalid assignee

**Response: `400 Bad Request`**

```json
{
  "error": "assignee must be a non-empty string"
}
```

### Already assigned

**Response: `400 Bad Request`**

```json
{
  "error": "Task is already assigned"
}
```

## Tests Added

### Unit Tests

Added tests for:

- Successfully assigning a task.
- Returning `null` when the task does not exist.
- Rejecting reassignment and preserving the original assignee.

### Integration Tests with Supertest

Added tests for:

- Successful assignment.
- Persisting the assignee in the task.
- `404` for a nonexistent task.
- Missing assignee.
- Empty assignee.
- Whitespace-only assignee.
- Invalid assignee types.
- Rejecting reassignment.
- Preserving the original assignee after a rejected reassignment.

## Design Decisions

The assignee is stored directly on the existing task object because the assignment uses an in-memory task store and the requirement is to persist the assignee on the task.

Reassignment is rejected instead of silently overwriting the existing assignee. This prevents an existing assignment from being accidentally replaced.

Validation is performed at the route level, while the assignment and reassignment rules are handled by the service layer. This keeps HTTP validation separate from business logic.



## Submission Note

### What I'd test next if I had more time
I would add more validation and boundary tests, especially for invalid pagination values, combinations of query parameters, and additional edge cases around task updates and completion. I would also add tests for the behavior of multiple tasks being assigned and verify the API's behavior with unexpected request bodies.

### Anything that surprised me in the codebase
I was surprised by how easily some incorrect behavior could pass normal happy-path tests. In particular, the pagination implementation used an incorrect offset calculation, which caused the first page to skip tasks. I also found that the status filter used partial string matching, which could return `in_progress` when searching for `progress`.

### Questions I'd ask before shipping this to production
I would ask how task validation and pagination are expected to behave for invalid input, whether tasks should support reassignment, and what the expected API contract is for filtering and completion behavior. I would also ask about persistence, authentication/authorization, logging, and error-handling requirements before moving the in-memory API to production.