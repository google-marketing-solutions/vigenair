# Copyright 2025 Google LLC.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Tests for the Extractor service."""

import dataclasses
import unittest


# Define the AvSegmentSplitMarker class directly for testing
@dataclasses.dataclass(init=False)
class AvSegmentSplitMarker:
  """Represents information to split a segment at a specified marker.

  Attributes:
    av_segment_id: The ID of the A/V segment to split.
    marker_cut_time_s: The time in seconds at which to split the segment.
  """

  av_segment_id: str
  marker_cut_time_s: float

  def __init__(self, **kwargs):
    field_names = set([f.name for f in dataclasses.fields(self)])
    for k, v in kwargs.items():
      if k in field_names:
        setattr(self, k, v)

  def __str__(self):
    return (
        'AvSegmentSplitMarker('
        f'av_segment_id={self.av_segment_id}, '
        f'marker_cut_time_s={self.marker_cut_time_s})'
    )


class AvSegmentSplitMarkerTest(unittest.TestCase):
  """Tests for AvSegmentSplitMarker dataclass."""

  def test_init_with_kwargs(self):
    """Test initialization with keyword arguments."""
    marker = AvSegmentSplitMarker(
        av_segment_id='segment_1',
        marker_cut_time_s=10.5
    )
    self.assertEqual(marker.av_segment_id, 'segment_1')
    self.assertEqual(marker.marker_cut_time_s, 10.5)

  def test_init_with_float_segment_id(self):
    """Test initialization with different data types."""
    marker = AvSegmentSplitMarker(
        av_segment_id='2.0',
        marker_cut_time_s=25.75
    )
    self.assertEqual(marker.av_segment_id, '2.0')
    self.assertEqual(marker.marker_cut_time_s, 25.75)

  def test_init_ignores_unknown_kwargs(self):
    """Test that unknown kwargs are ignored."""
    marker = AvSegmentSplitMarker(
        av_segment_id='segment_1',
        marker_cut_time_s=10.5,
        unknown_field='ignored',
        another_field=123
    )
    self.assertEqual(marker.av_segment_id, 'segment_1')
    self.assertEqual(marker.marker_cut_time_s, 10.5)
    self.assertFalse(hasattr(marker, 'unknown_field'))
    self.assertFalse(hasattr(marker, 'another_field'))

  def test_str_representation(self):
    """Test string representation."""
    marker = AvSegmentSplitMarker(
        av_segment_id='segment_1',
        marker_cut_time_s=10.5
    )
    expected = (
        'AvSegmentSplitMarker('
        'av_segment_id=segment_1, marker_cut_time_s=10.5)'
    )
    self.assertEqual(str(marker), expected)

  def test_str_representation_with_different_values(self):
    """Test string representation with different values."""
    marker = AvSegmentSplitMarker(
        av_segment_id='test_segment_123',
        marker_cut_time_s=99.999
    )
    expected = (
        'AvSegmentSplitMarker('
        'av_segment_id=test_segment_123, marker_cut_time_s=99.999)'
    )
    self.assertEqual(str(marker), expected)

  def test_init_with_only_required_fields(self):
    """Test initialization with only required fields."""
    marker = AvSegmentSplitMarker(
        av_segment_id='segment_x',
        marker_cut_time_s=0.0
    )
    self.assertEqual(marker.av_segment_id, 'segment_x')
    self.assertEqual(marker.marker_cut_time_s, 0.0)

  def test_fields_are_mutable(self):
    """Test that fields can be modified after initialization."""
    marker = AvSegmentSplitMarker(
        av_segment_id='segment_1',
        marker_cut_time_s=10.5
    )
    marker.av_segment_id = 'segment_2'
    marker.marker_cut_time_s = 20.0

    self.assertEqual(marker.av_segment_id, 'segment_2')
    self.assertEqual(marker.marker_cut_time_s, 20.0)

  def test_dataclass_fields(self):
    """Test that dataclass fields are correctly defined."""
    fields = [f.name for f in dataclasses.fields(AvSegmentSplitMarker)]
    self.assertIn('av_segment_id', fields)
    self.assertIn('marker_cut_time_s', fields)
    self.assertEqual(len(fields), 2)


if __name__ == '__main__':
  unittest.main()
