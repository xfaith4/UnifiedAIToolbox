"""
Artifact normalization module for orchestration tool.

Provides automatic normalization of generated ZIP artifacts to ensure
they are runnable, correctly structured repositories.
"""

from .normalizer import ArtifactNormalizer
from .transform_logger import TransformLogger

__all__ = ["ArtifactNormalizer", "TransformLogger"]
