"""Public model category for each durable generation task kind."""


def billing_kind(task_type):
    return {'online-image': 'image', 'llm': 'chat', 'audio': 'audio'}.get(task_type, 'video')
