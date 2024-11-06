
def shuffle_list(items):
    """
    Shuffles the elements of a given list and returns a new list with the shuffled elements.
    
    Args:
        items (list): A list of elements to be shuffled.
    
    Returns:
        list: A new list containing the elements of the input list in a random order.
    """
    from random import shuffle
    temp = items.copy()
    shuffle(temp)
    return temp


def count_vowels(text):
    """
    Counts the number of vowels in a given text string.
    
    Args:
        text (str): The input string in which to count the vowels.
    
    Returns:
        int: The total number of vowels (a, e, i, o, u) found in the input string.
    """
    return sum(1 for char in text.lower() if char in 'aeiou')


def fibonacci(n):
    """
    Calculates the nth Fibonacci number using an iterative approach.
    
    Args:
        n (int): The position in the Fibonacci sequence to retrieve, where n is a non-negative integer.
    
    Returns:
        int: The nth Fibonacci number.
    """
    if n <= 1:
        return n
    a, b = 0, 1
    for _ in range(n - 1):
        a, b = b, a + b
    return b

def chunk_list(lst, size):
    """
    Splits a list into smaller chunks of a specified size.
    
    Args:
        lst (list): The list to be divided into chunks.
        size (int): The maximum size of each chunk.
    
    Returns:
        list: A list containing the chunks of the original list.
    """
    return [lst[i:i + size] for i in range(0, len(lst), size)]


def deep_flatten(lst):
    """
    Recursively flattens a nested list or tuple into a single list containing all the elements.
    
    Args:
        lst (list or tuple): A nested list or tuple that may contain other lists or tuples.
    
    Returns:
        list: A flat list containing all the elements from the input nested structure.
    """
    flat = []
    for item in lst:
        if isinstance(item, (list, tuple)):
            flat.extend(deep_flatten(item))
        else:
            flat.append(item)
    return flat


def remove_duplicates_preserve_order(items):
    """
    Removes duplicate elements from a list while preserving the original order of the elements.
    
    Args:
        items (list): A list of elements from which duplicates will be removed.
    
    Returns:
        list: A new list containing the elements from the original list with duplicates removed, in their original order.
    """
    seen = set()
    return [x for x in items if not (x in seen or seen.add(x))]