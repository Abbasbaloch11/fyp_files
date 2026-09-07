"""
Shared helper utilities used across the RAG multi-agent project.
"""

from typing import Any


def extract_text(content: Any) -> str:
    """
    Normalize a LangChain / LangGraph message `.content` field into a
    plain string.

    Depending on the model/provider, `content` can be:
      - a plain string (most common with Gemini)
      - a list of content blocks, e.g. [{"type": "text", "text": "..."}]
      - a list of plain strings
      - None

    This function safely handles all of the above so calling code never
    has to guess the shape of the response.
    """

    if content is None:
        return ""

    if isinstance(content, str):
        return content

    if isinstance(content, list):
        parts = []

        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict):
                # Common shape: {"type": "text", "text": "..."}
                text = block.get("text") or block.get("content") or ""
                if text:
                    parts.append(str(text))
            else:
                # Fallback: rely on the object's own string form
                parts.append(str(block))

        return "\n".join(parts).strip()

    # Fallback for any other type
    return str(content)
