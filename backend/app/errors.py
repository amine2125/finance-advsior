"""Domain errors mapped to structured HTTP responses."""


class NotFound(LookupError):
    """A requested record does not exist in the caller's partition."""
