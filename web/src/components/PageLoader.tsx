import { Center, Loader } from '@mantine/core';

/** Loading state of a whole screen: in the middle of the content area, not in its corner. */
export const PageLoader = () => <Center h="60vh"><Loader /></Center>;
