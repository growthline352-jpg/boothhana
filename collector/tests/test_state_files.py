import unittest
from unittest.mock import patch
from state_files import replace_with_retry


class StateFilesTests(unittest.TestCase):
    def test_transient_windows_denial_retries_same_atomic_replace(self):
        with patch('state_files.sys.platform','win32'),patch('state_files.time.sleep') as sleep,patch('state_files.os.replace',side_effect=[PermissionError('sharing violation'),None]) as replace:
            replace_with_retry('new.tmp','state.json')
        self.assertEqual(replace.call_count,2);sleep.assert_called_once_with(0.02)
        self.assertTrue(all(call.args==('new.tmp','state.json') for call in replace.call_args_list))

    def test_persistent_denial_is_bounded_and_not_silenced(self):
        with patch('state_files.sys.platform','win32'),patch('state_files.time.sleep'),patch('state_files.os.replace',side_effect=PermissionError('denied')) as replace:
            with self.assertRaises(PermissionError):replace_with_retry('new.tmp','state.json')
        self.assertEqual(replace.call_count,6)


if __name__=='__main__':unittest.main()
