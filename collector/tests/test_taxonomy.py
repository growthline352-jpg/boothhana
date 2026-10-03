import sys
from pathlib import Path
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from taxonomy import FIELDS, category_for, matches_topic, topic_review_reasons
from data_quality import missing_reasons

class TaxonomyTests(unittest.TestCase):
 def test_popup_formats_and_topics_remain_independent(self):
  field=next(f for f in FIELDS if f['code']=='POPUP')
  for t in field['types']:self.assertEqual(category_for(t['code']),'POPUP')
  self.assertEqual(category_for('POPUP_STORE'),'SUBCULTURE')
  game=next(o for o in field['topics'] if o['code']=='GAME')
  self.assertTrue(matches_topic(game,'POPUP_EXPERIENCE',['GAME']))
  self.assertFalse(matches_topic(game,'POPUP_EXPERIENCE',['FASHION']))
 def test_new_types_stay_in_the_correct_field(self):
  for code in ('FAN_CAFE','POPUP_STORE','CARD_COLLECTIBLES','FAN_CONVENTION'):
   self.assertEqual(category_for(code),'SUBCULTURE')
  for code in ('CONCERT','MUSIC_FESTIVAL'):
   self.assertEqual(category_for(code),'FESTIVAL')
 def test_legacy_source_codes_and_works_reach_the_right_topic(self):
  sub=next(f for f in FIELDS if f['code']=='SUBCULTURE')
  game=next(o for o in sub['topics'] if o['code']=='GAME')
  self.assertTrue(matches_topic(game,'SUBCULTURE_MUSIC',[' GAME_OST_CONCERT ']))
  self.assertFalse(matches_topic(game,'SUBCULTURE_MUSIC',['ANIME_GAME_MUSIC']))
  self.assertEqual(topic_review_reasons('ONLY_EVENT',['괴담출근']),[])
 def test_review_queue_sees_missing_or_type_only_topics(self):
  self.assertIn('MISSING_INTEREST_SUBJECTS',missing_reasons({'subcategory':'LIFESTYLE','subjects':[]}))
  self.assertEqual(topic_review_reasons('ONLY_EVENT',['ONLY_EVENT']),['NO_INTEREST_TOPIC','TYPE_ONLY_SUBJECTS'])
  self.assertEqual(topic_review_reasons('DOLL',['DOLL']),[])
 def test_rock_alias_does_not_match_all_music(self):
  field=next(f for f in FIELDS if f['code']=='FESTIVAL')
  rock=next(o for o in field['topics'] if o['code']=='ROCK')
  self.assertTrue(matches_topic(rock,'MUSIC',['JPOP_JROCK']))
  self.assertFalse(matches_topic(rock,'MUSIC',['음악']))
