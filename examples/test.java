public class TestClass {

/**
 * Reverses the given string and returns the reversed version.
 * @param input The string to be reversed.
 * @return The reversed string.
 */
    public String reverseString(String input) {
        StringBuilder result = new StringBuilder();
        for (int i = input.length() - 1; i >= 0; i--) {
            result.append(input.charAt(i));
        }
        return result.toString();
    }

/**
 * Checks if the given string is a palindrome, ignoring case and non-alphanumeric characters.
 * @param str The string to be checked for palindrome properties.
 * @return true if the string is a palindrome, false otherwise.
 */
    private boolean isPalindrome(String str) {
        str = str.toLowerCase().replaceAll("[^a-zA-Z0-9]", "");
        int left = 0;
        int right = str.length() - 1;
        while (left < right) {
            if (str.charAt(left) != str.charAt(right)) {
                return false;
            }
            left++;
/**
 * Finds the maximum value in an array of integers.
 * @param array An array of integers from which to find the maximum value. 
 *              Must not be empty.
 * @return The maximum integer value found in the array.
 */
            right--;
        }
        return true;
    }

    public int findMax(int[] array) {
        if (array.length == 0) throw new IllegalArgumentException("Array is empty");
        int max = array[0];
        for (int i = 1; i < array.length; i++) {
            if (array[i] > max) {
                max = array[i];
            }
        }
        return max;
    }
}
